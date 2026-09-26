package ai.riviera.platform.notification.adapter.in;

import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import ai.riviera.platform.notification.application.MailTransportBudget;
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
 * The registry vehicle's own bounded executor: a bulkhead keeping a degraded SMTP relay off Boot's
 * shared {@code applicationTaskExecutor}, the money-path spine (RESPONSIBILITIES.md §notification).
 * Core equals max; at capacity it sheds (never throws, never runs on the caller) and loses nothing,
 * as the registry republishes; an expired drain window gives up, never interrupts (duplicate mail).
 * {@code defaultCandidate = false} is load-bearing: a by-type {@code Executor} bean makes Boot drop
 * the shared pool and unqualified {@code @Async} go unbounded ({@code RegistryMailExecutorWiringIT}).
 */
@Configuration
@EnableConfigurationProperties(RegistryMailProperties.class)
class RegistryMailExecutorConfig {

	/**
	 * The bean name, shared as a compile-time constant with the {@code @Async} that names it, so the
	 * two cannot drift into a silent fallback onto the shared executor.
	 */
	static final String MAIL_EXECUTOR = "registryMailExecutor";

	/** Package-private so the spec can assert a send ran on <em>this</em> pool without restating it. */
	static final String THREAD_NAME_PREFIX = "registry-mail-";

	private static final Logger log = LoggerFactory.getLogger(RegistryMailExecutorConfig.class);

	@Bean(name = MAIL_EXECUTOR, defaultCandidate = false)
	ThreadPoolTaskExecutor registryMailExecutor(RegistryMailProperties props, MeterRegistry meters,
			MailTransportBudget budget) {
		SaturationPolicy saturation = new SaturationPolicy(meters);
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(props.poolSize());
		pool.setMaxPoolSize(props.poolSize());
		pool.setQueueCapacity(props.queueCapacity());
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setRejectedExecutionHandler(saturation);
		// Composed, never replaced: the pool has one decorator slot and two decorators need it.
		pool.setTaskDecorator(new CompositeTaskDecorator(List.of(saturation, new MdcTaskDecorator())));
		// One socket operation's grace for sends already in flight; whatever does not finish stays outstanding.
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationMillis(budget.shutdownDrain().toMillis());
		return pool;
	}

	/**
	 * Counts every shed send, logs {@code ERROR} once per episode; an episode ends when the queue drains,
	 * not when a task starts. A shutdown rejection is not saturation and is neither counted nor escalated.
	 * Shares the pool's one {@code TaskDecorator} slot via {@link CompositeTaskDecorator}: a third
	 * decorator joins that list, never calls {@code setTaskDecorator} again (the flag would never clear).
	 * Never throws or runs the task; the line carries no recipient or code (invariant #7) and is logged
	 * on the submitting thread.
	 */
	private static final class SaturationPolicy implements RejectedExecutionHandler, TaskDecorator {

		private final Counter shed;
		private final AtomicBoolean episodeOpen = new AtomicBoolean();

		/**
		 * The backlog watched for an episode's end, captured at the first rejection because Spring
		 * initializes the queue only after the {@code @Bean} method returns.
		 */
		private final AtomicReference<BlockingQueue<Runnable>> backlog = new AtomicReference<>();

		SaturationPolicy(MeterRegistry meters) {
			this.shed = meters.counter(ObservabilityMetrics.MAIL_REGISTRY_SHED);
		}

		@Override
		public void rejectedExecution(Runnable task, ThreadPoolExecutor executor) {
			if (executor.isShutdown()) {
				log.info("Registry mail executor is shutting down; the send was not attempted and stays "
						+ "outstanding for the next start's republish");
				return;
			}
			backlog.set(executor.getQueue());
			shed.increment();
			if (episodeOpen.compareAndSet(false, true)) {
				log.error("Registry mail executor saturated; sends are being shed and stay outstanding "
						+ "for the next restart's republish. Further sheds in this episode are counted "
						+ "under {} rather than logged", ObservabilityMetrics.MAIL_REGISTRY_SHED);
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
