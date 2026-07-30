package ai.riviera.platform.booking.adapter.in;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import ai.riviera.platform.shared.ObservabilityMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * The executor {@link BookingRefundListener} drains on (#404) — a bulkhead between a degraded payment
 * gateway and the money-path spine.
 *
 * <p><strong>Why this bean exists at all.</strong> {@code @ApplicationModuleListener} expands to
 * {@code @Async} with no qualifier, which is Boot's shared {@code applicationTaskExecutor} — the same
 * pool that carries {@link PaymentEventListener} (payment → confirm, invariant #8) and {@code payout}'s
 * accrual/reversal listeners (invariant #9), 8 core threads behind an <em>unbounded</em> queue. The
 * refund listener's body is a blocking gateway round-trip, so under the {@code stripe} profile that put
 * up to 25s of network wait on the spine's threads, once per cancellation. #383 fixed the same hazard
 * class for mail and its generalization-audit pass named this listener as the one genuine sibling it had
 * deferred; this is that deferral closed.
 *
 * <p><strong>The burst is what makes it acute, and it is not the one the issue assumed.</strong> A
 * tourist cancellation produces one refund, which is why #404 was filed as the milder of the two. But
 * {@code WeatherRefundService} cancels <em>every</em> confirmed booking for a {@code (venue, date)} in
 * one transaction (invariant #10's admin weather exception) and publishes a {@code BookingCancelled} for
 * each, so a single admin action dispatches a whole venue-day of refunds at once. On the shared pool a
 * 60-booking venue-day against a degraded gateway is ~3 minutes during which every spine listener queues
 * behind refunds — including the confirmation a tourist who has just paid is waiting for.
 *
 * <p><strong>Bounded on every axis, and the saturation behaviour is a contract, not an accident.</strong>
 * Core equals max deliberately: a {@code ThreadPoolExecutor} grows past its core size only once the queue
 * is <em>full</em>, so a larger max would add no headroom until the whole queue were already backed up.
 * All three bounds are {@link RefundExecutorProperties}, which carries the sizing argument behind each.
 * At {@code poolSize + queueCapacity} the pool <strong>sheds</strong>: the rejection handler counts and
 * discards instead of throwing (an {@code AFTER_COMMIT} listener is dispatched from inside
 * {@code commit()}, so a throw would surface on the very thread this pool protects — and would report a
 * server error for a cancellation that has already succeeded) and instead of running on the caller's
 * thread (which would be the original defect, reached from the other side).
 *
 * <p><strong>Shedding here loses nothing, but it is not free either — and that asymmetry is why the
 * queue is deep.</strong> The mechanism matches #383's: a shed submission never runs, so the listener
 * never completes, so its Event Publication Registry row stays outstanding and
 * {@code republish-outstanding-events-on-restart} re-delivers it; until then it keeps
 * {@code riviera.outbox.pending} non-zero, which {@code MoneyPathAlertCheck} already watches. Two things
 * differ from mail, both pushing the same way. A refund is money owed to a tourist under invariant #10,
 * where "retried whenever we next deploy" is a far less comfortable contract than it is for a
 * confirmation mail. And a shed is the one loss mode that does <strong>not</strong> trigger its own
 * recovery — a crash restarts by definition, a shed happens while the process is healthy — while the
 * outbox alert's default threshold of 10 means a single shed refund would never reach it. Hence
 * {@link ObservabilityMetrics#REFUNDS_SHED}, and hence a queue sized so that reaching it at all takes a
 * burst far larger than one weather-refund sweep. Every replay is safe because the gateway call is
 * idempotency-keyed on the booking id ({@code booking-<id>-refund}), so a republished publication
 * re-issues the same key and the gateway returns the original refund rather than moving money twice.
 *
 * <p><strong>Expiring the drain window means giving up, not interrupting.</strong>
 * {@code ExecutorConfigurationSupport} awaits {@code shutdownDrain} and then returns; this configuration
 * deliberately does not escalate to {@code shutdownNow()}. The reason is weaker than the mail pool's and
 * lands in the same place: an interrupted refund cannot double-charge (the idempotency key sees to that),
 * but it may have reached the gateway with {@code markRefunded} unwritten, and the recovery for that is
 * precisely the republish that an unfinished listener leaves available. Interrupting adds a race and
 * buys nothing.
 *
 * <p><strong>{@code defaultCandidate = false} is load-bearing — do not "tidy" it away.</strong> Boot
 * declares {@code applicationTaskExecutor} {@code @ConditionalOnMissingBean(Executor.class)}, so merely
 * <em>defining</em> a second {@link java.util.concurrent.Executor} bean makes Boot skip the shared pool
 * entirely. Unqualified {@code @Async} — every money-path listener — then falls through to an unbounded
 * {@code SimpleAsyncTaskExecutor}, one new thread per event: this bulkhead would have removed a bound
 * from the exact path it exists to protect, and no test would have failed, because unbounded threads
 * always keep up. Excluding this bean from by-type resolution keeps Boot's condition unmet while leaving
 * it addressable by name, which is all {@code @Async} needs. {@code RefundExecutorWiringIT} pins it in
 * the configuration #383 could not: with <em>two</em> such executors in one context.
 */
@Configuration
@EnableConfigurationProperties(RefundExecutorProperties.class)
class RefundExecutorConfig {

	/**
	 * The bean name, shared as a compile-time constant with the {@code @Async} that names it, so the two
	 * cannot drift into a silent fallback onto the shared executor.
	 */
	static final String REFUND_EXECUTOR = "bookingRefundExecutor";

	/** Package-private so a spec can assert a refund ran on <em>this</em> pool without restating it. */
	static final String THREAD_NAME_PREFIX = "booking-refund-";

	private static final Logger log = LoggerFactory.getLogger(RefundExecutorConfig.class);

	@Bean(name = REFUND_EXECUTOR, defaultCandidate = false)
	ThreadPoolTaskExecutor bookingRefundExecutor(RefundExecutorProperties props, MeterRegistry meters) {
		SaturationPolicy saturation = new SaturationPolicy(meters);
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(props.poolSize());
		pool.setMaxPoolSize(props.poolSize());
		pool.setQueueCapacity(props.queueCapacity());
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setRejectedExecutionHandler(saturation);
		// The pool has ONE decorator slot: a second decorator must join this one via a
		// CompositeTaskDecorator, never replace it, or the episode flag silently stops clearing (#410).
		pool.setTaskDecorator(saturation);
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationMillis(props.shutdownDrain().toMillis());
		return pool;
	}

	/**
	 * What saturation does: <strong>count every shed refund, escalate once per episode.</strong>
	 *
	 * <p>The <em>counter</em> is the signal to alert on, and it is the whole reason a shed is survivable
	 * as a design: {@code riviera.outbox.pending} would also rise, but its alert threshold is 10, so a
	 * handful of shed refunds is invisible there while being exactly the case worth paging on.
	 * {@link ObservabilityMetrics#REFUNDS_SHED} increments unconditionally and before the episode flag is
	 * consulted, so throttling the log can never cost a count.
	 *
	 * <p>The <em>log</em> is one escalated line per episode, not per rejected task. At saturation the
	 * handler fires once per submission, so a wedged gateway during a weather-refund sweep would
	 * otherwise bury the lines that matter under hundreds of identical ones. {@code ERROR} rather than
	 * {@code WARN} because a shed refund is not merely delayed: nothing retries it until the next
	 * restart's republish, and until then a tourist owed money under invariant #10 has not been paid.
	 *
	 * <p><strong>An episode ends when the queue drains, not when a task starts.</strong> Clearing the
	 * flag on every task start would tie the log rate to the pool's <em>drain</em> rate rather than to
	 * the incident, because under saturation each completed refund frees exactly one slot and the next
	 * arrival refills-then-rejects. Gating the reset on an empty queue makes "episode" mean what this
	 * says: one line while the backlog persists, and a new line for a genuinely new saturation.
	 *
	 * <p><strong>A rejection during shutdown is not saturation and is not counted as one.</strong> The
	 * pool is bounded but also {@code shutdown()} at context close, so an in-flight cancellation can
	 * still reach its {@code AFTER_COMMIT} dispatch after the executor stops accepting. That rejection
	 * arrives at this same handler from an <em>idle</em> pool; counting it would make every routine
	 * redeploy raise an "any increase" alert, and escalating it would describe a gateway degradation
	 * that never happened.
	 *
	 * <p>Neither path may throw or run the task: see this class's Javadoc for why both defeat the
	 * bulkhead. The lines carry counts and a metric name only — never a booking code (invariant #7).
	 * They are attributable without a {@code TaskDecorator} because {@code ThreadPoolExecutor.execute}
	 * calls {@code reject(...)} on the <strong>calling</strong> thread, which here is the thread
	 * committing the cancellation, so the context {@code CorrelationIdFilter} put there is still present.
	 */
	private static final class SaturationPolicy implements RejectedExecutionHandler, TaskDecorator {

		private final Counter shed;
		private final AtomicBoolean episodeOpen = new AtomicBoolean();

		/**
		 * The backlog the decorator watches to know when an episode ended, captured at the first
		 * rejection because the queue does not exist when this policy is constructed — Spring initializes
		 * the pool after the {@code @Bean} method returns. An {@link AtomicReference} rather than a
		 * {@code volatile} field so the type states that the referent, not just the reference, is safely
		 * published ({@code java:S3077}).
		 */
		private final AtomicReference<BlockingQueue<Runnable>> backlog = new AtomicReference<>();

		SaturationPolicy(MeterRegistry meters) {
			this.shed = meters.counter(ObservabilityMetrics.REFUNDS_SHED);
		}

		@Override
		public void rejectedExecution(Runnable task, ThreadPoolExecutor executor) {
			if (executor.isShutdown()) {
				log.info("Refund executor is shutting down; the refund was not attempted and stays "
						+ "outstanding for the next start's republish");
				return;
			}
			backlog.set(executor.getQueue());
			shed.increment();
			if (episodeOpen.compareAndSet(false, true)) {
				log.error("Refund executor saturated; refunds are being shed and stay outstanding for the "
						+ "next restart's republish — money owed under invariant #10 is unpaid until then. "
						+ "Further sheds in this episode are counted under {} rather than logged",
						ObservabilityMetrics.REFUNDS_SHED);
			}
		}

		@Override
		public Runnable decorate(Runnable task) {
			return () -> {
				endEpisodeIfDrained();
				task.run();
			};
		}

		private void endEpisodeIfDrained() {
			BlockingQueue<Runnable> queue = backlog.get();
			if (queue == null || queue.isEmpty()) {
				episodeOpen.set(false);
			}
		}
	}
}
