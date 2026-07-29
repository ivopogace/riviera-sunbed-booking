package ai.riviera.platform.notification.application;

import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * The pool that carries registry-borne mail (#383), deliberately separate from Boot's shared
 * {@code applicationTaskExecutor} — which carries the payment→booking confirmation and booking→payout
 * accrual spine — so a degraded relay cannot pin the money path's threads. Until this slice the
 * confirmation listener ran on that shared pool: 8 threads with an <em>unbounded</em> queue, so a wedged
 * relay could occupy every thread and queue the spine behind mail without ever shedding load. This is
 * the same rule {@link AsyncMailDispatcher} was built to honour for the recovery vehicle; it now holds
 * for both.
 *
 * <p><strong>Separate from the recovery pool, not shared with it</strong>, because their saturation
 * semantics are opposites: recovery drops a send the user can simply re-request, whereas a shed
 * confirmation must leave its publication outstanding so the registry still owes the mail.
 *
 * <p><strong>Sizing</strong> is two threads and a 100-deep queue by default, both env-tunable. Two
 * rather than one is not a throughput argument — one thread would carry thousands of sends an hour —
 * but a head-of-line one: {@code AsyncMailDispatcher} accepts a single serial drainer only because
 * everything on it is bounded, and an SMTP send is not (the configured timeouts are per socket
 * operation, not a session ceiling), so one pathological send would otherwise stall every confirmation
 * behind it. Core and max are equal because a {@code ThreadPoolExecutor} grows past core only once the
 * queue is <em>full</em>, so a larger max would buy nothing until the queue was already backed up.
 *
 * <p><strong>Saturation sheds</strong> — see {@link SaturationPolicy}.
 *
 * <p>Public only so {@code adapter/in} can name the bean in {@code @Async}, whose value must be a
 * compile-time constant; the module publishes only {@code notification::api}, so nothing outside this
 * module can reach it.
 */
@Configuration(proxyBeanMethods = false)
public class ConfirmationMailExecutorConfig {

	/** The {@code @Async} qualifier on the confirmation listener. */
	public static final String BEAN_NAME = "confirmationMailExecutor";

	/** Asserted by the bulkhead IT: mail must never be seen on the spine's {@code task-} threads. */
	public static final String THREAD_NAME_PREFIX = "confirmation-mail-";

	/** Counter: confirmation mails shed because the pool was saturated. */
	public static final String SHED_COUNTER = "riviera.mail.confirmation.shed";

	private static final int SHUTDOWN_DRAIN_SECONDS = 5;

	@Bean(BEAN_NAME)
	ThreadPoolTaskExecutor confirmationMailExecutor(MeterRegistry meters,
			@Value("${riviera.notification.confirmation-mail.pool-size}") int poolSize,
			@Value("${riviera.notification.confirmation-mail.queue-capacity}") int queueCapacity) {

		SaturationPolicy saturation = new SaturationPolicy(meters);
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(poolSize);
		pool.setMaxPoolSize(poolSize);
		pool.setQueueCapacity(queueCapacity);
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setRejectedExecutionHandler(saturation);
		pool.setTaskDecorator(saturation);
		// A redeploy must not abandon a confirmation mid-send; what it cannot drain stays outstanding.
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationSeconds(SHUTDOWN_DRAIN_SECONDS);
		return pool;
	}

	/**
	 * What a full queue does: <strong>shed the send, count it, and return normally</strong> (#383, OQ-1).
	 *
	 * <p>Shedding is safe for durability because {@code @Async} is the outermost advice: a task that never
	 * reaches the pool never reaches {@code CompletionRegisteringAdvisor} either, so nothing is marked and
	 * the publication keeps {@code completion_date} NULL — the registry still owes the mail and redelivers
	 * it on the next resubmission.
	 *
	 * <p>It deliberately does <strong>not</strong> throw. A {@code TaskRejectedException} could not fail
	 * the money path — {@code AFTER_COMMIT} is dispatched from {@code afterCompletion}, whose exceptions
	 * {@code TransactionSynchronizationUtils} catches and logs, after the commit has already succeeded —
	 * but it would surface as "TransactionSynchronization.afterCompletion threw exception" beside a
	 * payment confirm: an alarming message about the wrong subsystem, at exactly the moment someone is
	 * diagnosing a relay outage. {@code CallerRunsPolicy} is forbidden outright — it would run the SMTP
	 * call on the money-path thread, the failure this class exists to prevent.
	 *
	 * <p>The log is <strong>one line per episode</strong>, not per shed: a relay outage during a booking
	 * burst would otherwise bury the lines that matter. The flag clears as soon as any task runs, so a
	 * later burst logs again. The counter, not the log, is the signal to alert on — a shed send means a
	 * paying tourist has no arrival code until the mail is resubmitted.
	 */
	private static final class SaturationPolicy implements RejectedExecutionHandler, TaskDecorator {

		private static final Logger log = LoggerFactory.getLogger(ConfirmationMailExecutorConfig.class);

		private final MeterRegistry meters;
		private final AtomicBoolean shedding = new AtomicBoolean();

		SaturationPolicy(MeterRegistry meters) {
			this.meters = meters;
		}

		@Override
		public void rejectedExecution(Runnable task, ThreadPoolExecutor executor) {
			meters.counter(SHED_COUNTER).increment();
			if (shedding.compareAndSet(false, true)) {
				// No address and no arrival code (invariant #7); the correlation id rides the MDC.
				log.error("Confirmation mail shed: the mail pool is saturated, so the send was not "
						+ "attempted. The event publication stays outstanding and will be redelivered.");
			}
		}

		@Override
		public Runnable decorate(Runnable task) {
			return () -> {
				shedding.set(false);
				task.run();
			};
		}
	}
}
