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
 * Production {@link MailDispatcher}: a small bounded in-memory pool that takes the SMTP round-trip off
 * the request thread, closing the timing account-enumeration oracle the real {@code SmtpMailer} opened on
 * the known-email branch of {@code register} / {@code forgot-password}.
 *
 * <p><strong>Its own pool, and bounded.</strong> Boot's shared {@code applicationTaskExecutor} carries
 * the payment→booking and booking→payout listeners, so a degraded relay sharing it could back up the
 * money path. Bounded for the complementary reason: a saturated dispatcher <em>drops</em> the send rather
 * than queueing without limit or — far worse — falling back to running it on the caller's thread, which
 * would re-open the very oracle this class exists to close. Why this vehicle drops where the registry
 * vehicle sheds, what each {@code reason} tag means, why every drop is logged rather than throttled per
 * episode, and what {@link ObservabilityMetrics#MAIL_RECOVERY_DROPPED} may be read as ("never ran", never
 * "refused"): {@code RESPONSIBILITIES.md} §{@code notification} and
 * {@code docs/runbooks/observability.md}.
 *
 * <p><strong>One drainer thread, and core == max on purpose.</strong> A {@code ThreadPoolExecutor} grows
 * past its core size only once the queue is <em>full</em>, so a larger max with this queue would add no
 * headroom until 100 sends were already backed up — an inviting number to "tune" and a misleading one to
 * read. Recovery mail is a handful of sends a day; a serial drain behind a 100-deep buffer is the whole
 * requirement.
 *
 * <p><strong>Everything that runs on this thread must be bounded</strong>, because one serial drainer
 * means one wedged task stalls the queue and then silently drops sends once the slots fill. Two things
 * run here, not one: the SMTP round-trip, whose connect/read/write timeouts are finite, and the
 * suppression-list read, whose {@code queryTimeout} is scoped to that one lookup in
 * {@code JdbcEmailSuppressions} — never set globally, where it would also bound {@code availability}'s
 * {@code INSERT … ON CONFLICT} claim, whose loser waits on the winner's index tuple lock (invariant #2).
 *
 * <p>The submitting request's logging context rides along through the shared {@link MdcTaskDecorator}, so
 * a failed send stays traceable to the request whose user is still waiting. Package-private (RV-BE-11);
 * pinned by {@code AsyncMailDispatcherTest}.
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
	 * Account for a send that will never be delivered. Nothing here may throw or run the task: this runs on
	 * the caller's request thread, whose response the send may not influence (D-8). Neither line carries the
	 * address or the link (invariant #7); the correlation id rides the MDC, and the kind names which flow
	 * was lost — never whose mail, which is the most that can be said without breaking that invariant.
	 *
	 * <p><strong>The cause is read after the rejection, and that race is one-directional.</strong>
	 * {@code execute} throws before this can ask why, so a saturation rejection coinciding with a concurrent
	 * {@code destroy()} is attributed to the shutdown; the converse cannot happen, {@code shutdown()}
	 * latching its flag permanently. The error is therefore always <em>under</em>-reporting saturation while
	 * a pod goes away — a deploy cannot manufacture a {@link #REASON_SATURATED} increment. Do not "fix" it
	 * by reading the flag before {@code execute}: that costs a read on every send and is equally racy, since
	 * no JDK primitive makes reject-and-classify atomic.
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
	 * Account for every send the drain window did not reach. {@code shutdown()} above has already awaited
	 * that window and given up, so anything still queued is a mail nobody will send and nothing else will
	 * see: {@code execute} returned normally, the task never ran, and this vehicle keeps no durable copy,
	 * so {@code riviera.outbox.pending} has nothing to carry either.
	 *
	 * <p><strong>Draining is what makes the count true, and it is not an interrupt.</strong> The pool is
	 * still <em>running</em> here — awaiting termination timed out, it did not stop the threads — so a send
	 * merely counted and left in place could still execute, and the counter would then report a loss that
	 * did not happen. {@code drainTo} makes the count and the loss the same event while touching only the
	 * queue. Racing the drainer is harmless in both directions: a {@code BlockingQueue} hands each task to
	 * exactly one of {@code poll} and {@code drainTo}, so it is run <em>xor</em> counted, never both and
	 * never neither. The send caught <em>running</em> is deliberately not counted — it may already have
	 * handed the message to the relay, the ambiguity that made giving up the right call.
	 */
	private void accountForAbandonedSends() {
		List<Runnable> abandoned = new ArrayList<>();
		executor.getThreadPoolExecutor().getQueue().drainTo(abandoned);
		abandoned.forEach(this::recordAbandonment);
	}

	/**
	 * One line per loss, under the abandoned send's <em>own</em> context: this runs on the thread closing
	 * the application context, which has no request of its own to name. Invariant #7 keeps the address and
	 * the link out of the line, so the borrowed correlation id and the kind are all that identify it.
	 *
	 * <p>The kind is read back through two wrappers: {@link MdcTaskDecorator}'s carrier, applied by the pool
	 * inside {@code execute}, around the {@link KindedSend} this class queued. {@link #dispatch} is the only
	 * path onto this queue and the executor is private here, so the unmatched branch is a defect in a future
	 * edit rather than a reachable state. It is reported as one instead of being swallowed, and deliberately
	 * invents <strong>no</strong> tag value for the case: a documented vocabulary gaining a member that
	 * means "we lost track" is how the next runbook sentence becomes false.
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
