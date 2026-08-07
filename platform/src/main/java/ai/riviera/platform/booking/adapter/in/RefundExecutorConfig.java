package ai.riviera.platform.booking.adapter.in;

import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import ai.riviera.platform.shared.MdcTaskDecorator;
import ai.riviera.platform.shared.ObservabilityMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.core.task.support.CompositeTaskDecorator;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * The executor {@link BookingRefundListener} drains on — a bulkhead between a degraded payment gateway
 * and the money-path spine.
 *
 * <p><strong>Why the bean exists.</strong> {@code @ApplicationModuleListener} expands to {@code @Async}
 * with no qualifier, which is Boot's shared {@code applicationTaskExecutor} — the same pool that carries
 * {@link PaymentEventListener} (payment → confirm, invariant #8) and {@code payout}'s accrual/reversal
 * listeners (invariant #9), behind an <em>unbounded</em> queue. The refund listener's body is a blocking
 * gateway round-trip, and {@code WeatherRefundService} dispatches a whole venue-day of them from one
 * admin action (invariant #10's weather exception), so sharing that pool puts minutes of network wait
 * ahead of the confirmation a tourist who has just paid is waiting for.
 *
 * <p><strong>Bounded on every axis, and the saturation behaviour is a contract.</strong> Core equals max
 * deliberately: a {@code ThreadPoolExecutor} grows past its core size only once the queue is
 * <em>full</em>, so a larger max would add no headroom until the whole queue were already backed up. All
 * three bounds are {@link RefundExecutorProperties}. At {@code poolSize + queueCapacity} the pool
 * <strong>sheds</strong> — the rejection handler counts and discards instead of throwing (an
 * {@code AFTER_COMMIT} listener is dispatched from inside {@code commit()}, so a throw would surface on
 * the very thread this pool protects, reporting a server error for a cancellation that already
 * succeeded) and instead of running on the caller's thread, which would be the original defect reached
 * from the other side.
 *
 * <p>A shed refund is recoverable but not free: the listener never completes, so its Event Publication
 * Registry row stays outstanding for the next start's republish, and every replay is safe because the
 * gateway call is idempotency-keyed on the booking id ({@code booking-<id>-refund}). Expiring the drain
 * window therefore means giving up rather than {@code shutdownNow()}: an interrupt cannot tell a refund
 * that reached the gateway from one that did not, and the republish is the recovery for both. Why the
 * queue is sized past one weather-refund sweep and why {@link ObservabilityMetrics#REFUNDS_SHED} exists
 * beside {@code riviera.outbox.pending}: {@code RESPONSIBILITIES.md} §{@code booking}.
 *
 * <p><strong>{@code defaultCandidate = false} is load-bearing — do not "tidy" it away.</strong> Boot
 * declares {@code applicationTaskExecutor} {@code @ConditionalOnMissingBean(Executor.class)}, so merely
 * <em>defining</em> a second {@link java.util.concurrent.Executor} bean makes Boot skip the shared pool
 * entirely. Unqualified {@code @Async} — every money-path listener — then falls through to an unbounded
 * {@code SimpleAsyncTaskExecutor}, one new thread per event: this bulkhead would have removed a bound
 * from the exact path it exists to protect, and no test would have failed, because unbounded threads
 * always keep up. Excluding this bean from by-type resolution keeps Boot's condition unmet while leaving
 * it addressable by name, which is all {@code @Async} needs. {@code RefundExecutorWiringIT} pins it with
 * <em>two</em> such executors in one context.
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
		// One decorator slot, two occupants: a third must join this list, never call setTaskDecorator again.
		pool.setTaskDecorator(new CompositeTaskDecorator(List.of(saturation, new MdcTaskDecorator())));
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationMillis(props.shutdownDrain().toMillis());
		return pool;
	}

	/**
	 * What saturation does: <strong>count every shed refund, escalate once per episode.</strong>
	 *
	 * <p>{@link ObservabilityMetrics#REFUNDS_SHED} increments unconditionally and before the episode flag
	 * is consulted, so throttling the log can never cost a count. The log is one escalated line per
	 * episode, not per rejected task: at saturation the handler fires once per submission, so a wedged
	 * gateway during a weather-refund sweep would otherwise bury the lines that matter under hundreds of
	 * identical ones. {@code ERROR} rather than {@code WARN} because a shed refund is not merely delayed —
	 * nothing retries it until the next restart's republish, and until then a tourist owed money under
	 * invariant #10 has not been paid.
	 *
	 * <p><strong>An episode ends when the queue drains, not when a task starts.</strong> Clearing the
	 * flag on every task start would tie the log rate to the pool's <em>drain</em> rate rather than to
	 * the incident, because under saturation each completed refund frees exactly one slot and the next
	 * arrival refills-then-rejects.
	 *
	 * <p><strong>A rejection during shutdown is not saturation and is not counted as one</strong> — it
	 * arrives at this same handler from an <em>idle</em> pool, so counting it would make every routine
	 * redeploy raise an "any increase" alert and escalating it would describe a gateway degradation that
	 * never happened.
	 *
	 * <p><strong>This policy shares the pool's single {@code TaskDecorator} slot</strong> with
	 * {@link MdcTaskDecorator}. A third decorator must <em>join that list</em> rather than call
	 * {@code setTaskDecorator} again, which silently replaces the lot: {@link #decorate} would then never
	 * run, so the episode flag would never clear and every saturation after the first would be counted but
	 * never logged. No test would go red for the missing lines, only for their absence in
	 * {@code aLaterEpisodeLogsAgain}.
	 *
	 * <p>Neither path may throw or run the task — both defeat the bulkhead. The lines carry counts and a
	 * metric name only, never a booking code (invariant #7), and are attributable without a
	 * {@code TaskDecorator} because {@code ThreadPoolExecutor.execute} calls {@code reject(...)} on the
	 * <strong>calling</strong> thread, which here is the thread committing the cancellation.
	 *
	 * <p>The flag's two writers race benignly: a worker that reads the queue as empty and writes after a
	 * fresh rejection re-opened the episode costs one extra {@code ERROR} line, and can lose neither a
	 * count (the increment is unconditional and runs first) nor a refund (the publication is untouched).
	 * Left as-is deliberately, and identically in {@code RegistryMailExecutorConfig} — fixing one copy
	 * only would diverge two implementations kept parallel on purpose.
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
