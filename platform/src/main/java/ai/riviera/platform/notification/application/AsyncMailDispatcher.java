package ai.riviera.platform.notification.application;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import ai.riviera.platform.shared.MdcTaskDecorator;
import ai.riviera.platform.shared.ObservabilityMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

/**
 * Production {@link MailDispatcher}: its own bounded pool (never the shared money-path executor) taking the
 * SMTP round-trip off the request thread to close the account-enumeration timing oracle. Saturated, it
 * <em>drops</em> the send — never runs it on the caller's thread. One drainer, core == max on purpose: a
 * bigger max adds no headroom until the queue is full. So everything run here must be bounded: SMTP timeouts,
 * and the suppression read's adapter-scoped {@code queryTimeout} (never global: invariant #2). Rationale and
 * {@code reason} tags: RESPONSIBILITIES.md §notification.
 */
@Component
class AsyncMailDispatcher implements MailDispatcher, DisposableBean {

	private static final Logger log = LoggerFactory.getLogger(AsyncMailDispatcher.class);

	private static final int POOL_SIZE = 1;

	/** Package-private so the spec can fill the queue exactly rather than hard-code a number that drifts. */
	static final int QUEUE_CAPACITY = 100;

	private static final String THREAD_NAME_PREFIX = "recovery-mail-";

	/** The drop's cause, as a metric tag — one series, two operationally different meanings. */
	static final String REASON_TAG = "reason";

	/** The pool was full: the relay is degraded or too slow for current volume. Investigate. */
	static final String REASON_SATURATED = "saturated";

	/** A redeploy outran an in-flight request. Still a lost mail, but no relay is at fault. */
	static final String REASON_SHUTDOWN = "shutdown";

	/** A redeploy outran the queue: accepted, never started, discarded when the drain window expired. */
	static final String REASON_ABANDONED = "abandoned";

	private final ThreadPoolTaskExecutor executor;
	private final Map<MailKind, Counter> droppedWhenSaturated;
	private final Map<MailKind, Counter> droppedWhenShuttingDown;
	private final Map<MailKind, Counter> droppedWhenAbandoned;

	AsyncMailDispatcher(MeterRegistry meters, MailTransportBudget budget) {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(POOL_SIZE);
		pool.setMaxPoolSize(POOL_SIZE);
		pool.setQueueCapacity(QUEUE_CAPACITY);
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setTaskDecorator(new MdcTaskDecorator());
		// A redeploy must not silently swallow a reset link a user is already waiting for.
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationMillis(budget.shutdownDrain().toMillis());
		pool.initialize();
		this.executor = pool;
		this.droppedWhenSaturated = countersFor(meters, REASON_SATURATED);
		this.droppedWhenShuttingDown = countersFor(meters, REASON_SHUTDOWN);
		this.droppedWhenAbandoned = countersFor(meters, REASON_ABANDONED);
	}

	/**
	 * Register one counter per kind for {@code reason}, up front. Resolving them lazily at the drop would
	 * read the same, but a series that springs into existence on its first loss is a series no dashboard
	 * can show at zero — and the whole point of these is to be watched while they are zero.
	 */
	private static Map<MailKind, Counter> countersFor(MeterRegistry meters, String reason) {
		Map<MailKind, Counter> counters = new EnumMap<>(MailKind.class);
		for (MailKind kind : MailKind.values()) {
			counters.put(kind, meters.counter(ObservabilityMetrics.MAIL_RECOVERY_DROPPED, MailKind.TAG,
					kind.tagValue(), REASON_TAG, reason));
		}
		return counters;
	}

	@Override
	public void dispatch(MailKind kind, Runnable send) {
		try {
			executor.execute(new KindedSend(kind, send));
		}
		catch (TaskRejectedException e) {
			recordDrop(kind, e);
		}
	}

	/**
	 * A queued send paired with the flow it belongs to, so a loss can still be attributed after the fact.
	 * It exists for {@link #accountForAbandonedSends()} alone: the two rejection paths learn the kind from
	 * the {@code dispatch} call they are failing, but the drain reaches a task submitted long before, by
	 * then wrapped in {@link MdcTaskDecorator}'s own carrier.
	 */
	private record KindedSend(MailKind kind, Runnable send) implements Runnable {

		@Override
		public void run() {
			send.run();
		}
	}

	/**
	 * Count and log a rejected send. Runs on the caller's thread, so it must never throw or run the task (D-8);
	 * no address or link in the line (invariant #7). A rejection racing {@code destroy()} reads as shutdown,
	 * never saturation — do not "fix" by checking the flag before {@code execute}: equally racy.
	 */
	private void recordDrop(MailKind kind, TaskRejectedException cause) {
		if (executor.getThreadPoolExecutor().isShutdown()) {
			droppedWhenShuttingDown.get(kind).increment();
			log.warn("The {} mail's dispatch was rejected during shutdown ({}); the send was dropped with "
					+ "nothing to retry from", kind.tagValue(), cause.getClass().getSimpleName());
			return;
		}
		droppedWhenSaturated.get(kind).increment();
		log.error("Recovery email dispatcher saturated ({}); the {} mail was dropped with nothing to retry from",
				cause.getClass().getSimpleName(), kind.tagValue());
	}

	@Override
	public void destroy() {
		executor.shutdown();
		accountForAbandonedSends();
	}

	/**
	 * Count every send still queued when the drain window expired. Use {@code drainTo}, not a peek: the pool is
	 * still running, so each task is run <em>xor</em> counted. The send caught running is not counted — it may
	 * already have reached the relay.
	 */
	private void accountForAbandonedSends() {
		List<Runnable> abandoned = new ArrayList<>();
		executor.getThreadPoolExecutor().getQueue().drainTo(abandoned);
		abandoned.forEach(this::recordAbandonment);
	}

	/**
	 * Count and log one loss under the queued send's <em>own</em> MDC context (this shutdown thread has none),
	 * never the address or link (invariant #7). A task that is not a {@link KindedSend} is a defect, reported
	 * as such — never invent a {@code reason} tag value for it.
	 */
	private void recordAbandonment(Runnable queued) {
		if (!(MdcTaskDecorator.payloadOf(queued) instanceof KindedSend(MailKind kind, Runnable ignored))) {
			log.error("A queued mail was discarded at shutdown but is not one this dispatcher submitted, so "
					+ "the loss cannot be attributed; {} must be reachable only through dispatch(...)",
					queued.getClass().getSimpleName());
			return;
		}
		droppedWhenAbandoned.get(kind).increment();
		MdcTaskDecorator.inContextOf(queued, () -> logAbandonment(kind));
	}

	private static void logAbandonment(MailKind kind) {
		log.warn("The {} mail was still queued when the shutdown drain window expired; the send was discarded "
				+ "with the pool and nothing retries it", kind.tagValue());
	}
}
