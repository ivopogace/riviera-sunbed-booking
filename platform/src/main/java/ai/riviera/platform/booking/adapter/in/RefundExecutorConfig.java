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
 * The bounded bulkhead this module's gateway-reaching listeners drain on, keeping blocking refund
 * round-trips off Boot's shared {@code applicationTaskExecutor} and the confirm/payout spine (#8, #9).
 * Core equals max (a larger max adds nothing until the queue is full); saturation sheds, counted and
 * never thrown or run on the caller (rationale: {@code RESPONSIBILITIES.md} §{@code booking}).
 * <strong>Keep {@code defaultCandidate = false}:</strong> a by-type {@code Executor} bean makes Boot
 * drop the shared pool, sending unqualified {@code @Async} to an unbounded one (RefundExecutorWiringIT).
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
	 * Count every shed refund ({@link ObservabilityMetrics#REFUNDS_SHED}, before the flag) and log one
	 * {@code ERROR} per episode, which ends when the queue drains, not when a task starts. A shutdown
	 * rejection is neither counted nor escalated. Never throw or run the task (either defeats the pool);
	 * never log a booking code (#7). A third {@code TaskDecorator} must join the composite, else
	 * {@link #decorate} stops running and the episode never clears. The flag's benign race mirrors
	 * {@code RegistryMailExecutorConfig}; change both or neither.
	 */
	private static final class SaturationPolicy implements RejectedExecutionHandler, TaskDecorator {

		private final Counter shed;
		private final AtomicBoolean episodeOpen = new AtomicBoolean();

		/**
		 * The queue the decorator watches for an episode's end, captured at the first rejection: it
		 * does not exist at construction (Spring initializes the pool after the {@code @Bean} returns).
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
