package ai.riviera.platform.notification.adapter.in;

import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;

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
 * The executor the <strong>registry vehicle</strong> drains on (#383) — a bulkhead between a degraded
 * SMTP relay and the money-path spine.
 *
 * <p><strong>Why this bean exists at all.</strong> {@code @ApplicationModuleListener} expands to
 * {@code @Async} with no qualifier, which is Boot's shared {@code applicationTaskExecutor} — the same
 * pool that carries {@code booking}'s {@code PaymentEventListener} (payment → confirm, invariant #8)
 * and {@code payout}'s accrual/reversal listeners (invariant #9). Under the {@code mailer} profile
 * that would put a blocking SMTP round-trip of up to ~30s (#368's connect + read + write timeouts) on
 * the spine's threads, behind Boot's <em>unbounded</em> queue, once per confirmed booking. #369 built
 * {@link ai.riviera.platform.notification.application.AsyncMailDispatcher} to prevent exactly that
 * for recovery mail and said so in its own Javadoc; #371 then put a higher-volume send back on the
 * shared pool. This is the missing half of that decision, and
 * {@code MailListenerExecutorArchitectureTest} keeps it from going missing again.
 *
 * <p><strong>Bounded on every axis, and the saturation behaviour is a contract, not an accident.</strong>
 * Core equals max deliberately: a {@code ThreadPoolExecutor} grows past its core size only once the
 * queue is <em>full</em>, so a larger max would add no headroom until the whole queue were already
 * backed up. Two threads rather than one — unlike the recovery dispatcher, whose serial
 * drain suits "a handful of sends a day" — because this is a per-confirmed-booking send and a single
 * wedged address would otherwise serialize every later confirmation behind its full timeout budget.
 * Both bounds are {@link RegistryMailProperties}, defaulting to the constants #383 shipped, so #370
 * can retune them against a real relay's latency without a code change.
 * At {@code poolSize + queueCapacity} the pool <strong>sheds</strong>: the rejection handler counts
 * and discards instead of throwing (an {@code AFTER_COMMIT} listener is dispatched from inside
 * {@code commit()}, so a throw would surface on the very thread this pool protects) and instead of
 * running on the caller's thread (which would be the original defect, reached from the other side).
 *
 * <p><strong>Shedding here loses nothing</strong>, and that is the one real difference from the
 * recovery dispatcher, whose drop <em>is</em> a loss it accepts because the user can re-request. A
 * shed send's Event Publication Registry row is still outstanding, so
 * {@code republish-outstanding-events-on-restart} re-delivers it — and until then it keeps
 * {@code riviera.outbox.pending} non-zero, which {@code MoneyPathAlertCheck} already watches. The two
 * pools stay separate on purpose: the recovery vehicle carries a bearer credential the registry may
 * not persist (ADR-0011 decision 5), so it has nothing to be retried from and <em>must</em> drop.
 *
 * <p><strong>{@code defaultCandidate = false} is load-bearing — do not "tidy" it away.</strong> Boot
 * declares {@code applicationTaskExecutor} {@code @ConditionalOnMissingBean(Executor.class)}, so
 * merely <em>defining</em> a second {@link java.util.concurrent.Executor} bean makes Boot skip the
 * shared pool entirely. Unqualified {@code @Async} — every money-path listener — then falls through
 * to an unbounded {@code SimpleAsyncTaskExecutor}, one new thread per event: this bulkhead would have
 * removed a bound from the exact path it exists to protect, and no test would have failed, because
 * unbounded threads always keep up. Excluding this bean from by-type resolution keeps Boot's
 * condition unmet while leaving it addressable by name, which is all {@code @Async} needs.
 * {@code RegistryMailExecutorWiringIT} pins both halves.
 */
@Configuration
@EnableConfigurationProperties(RegistryMailProperties.class)
class RegistryMailExecutorConfig {

	/**
	 * The bean name, shared as a compile-time constant with the {@code @Async} that names it, so the
	 * two cannot drift into a silent fallback onto the shared executor.
	 */
	static final String MAIL_EXECUTOR = "registryMailExecutor";

	private static final int SHUTDOWN_DRAIN_SECONDS = 5;
	private static final String THREAD_NAME_PREFIX = "registry-mail-";

	private static final Logger log = LoggerFactory.getLogger(RegistryMailExecutorConfig.class);

	@Bean(name = MAIL_EXECUTOR, defaultCandidate = false)
	ThreadPoolTaskExecutor registryMailExecutor(RegistryMailProperties props, MeterRegistry meters) {
		SaturationPolicy saturation = new SaturationPolicy(meters);
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(props.poolSize());
		pool.setMaxPoolSize(props.poolSize());
		pool.setQueueCapacity(props.queueCapacity());
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setRejectedExecutionHandler(saturation);
		pool.setTaskDecorator(saturation);
		// A short grace for sends already in flight; whatever does not finish stays outstanding.
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationSeconds(SHUTDOWN_DRAIN_SECONDS);
		return pool;
	}

	/**
	 * What saturation does: <strong>count every shed send, escalate once per episode</strong> (#408).
	 *
	 * <p>The <em>counter</em> is the signal to alert on. Before #408 the shed path logged and nothing
	 * else, so "how often did we shed?" was answerable only by grepping logs and no alert could watch
	 * it; {@link ObservabilityMetrics#MAIL_REGISTRY_SHED} makes it a Prometheus series. It increments
	 * unconditionally and before the flag is consulted, so throttling the log can never cost a count.
	 *
	 * <p>The <em>log</em> is one escalated line per episode, not per rejected task. At saturation the
	 * handler fires once per send, so a wedged relay during a booking burst would otherwise bury the
	 * lines that matter under hundreds of identical ones. {@code ERROR} rather than {@code WARN}
	 * because a shed send is not merely delayed: nothing retries it until the next restart's republish
	 * (or #405's admin resubmission), which can be days, and until then a paying tourist has no
	 * arrival code by mail.
	 *
	 * <p><strong>An episode ends when the queue drains, not when a task starts.</strong> The
	 * difference is the whole guarantee, and the first cut of #408 got it wrong: clearing the flag on
	 * every task start ties the log rate to the pool's <em>drain</em> rate rather than to the
	 * incident, because under saturation each completed send frees exactly one slot and the next
	 * arrival refills-then-rejects. A restart that republishes an hour of outstanding sends into a
	 * recovered relay would emit hundreds of lines — the flood the throttle was added to prevent.
	 * Gating the reset on an empty queue makes "episode" mean what the docs say: one line while the
	 * backlog persists, and a new line for a genuinely new saturation.
	 *
	 * <p><strong>A rejection during shutdown is not saturation and is not counted as one.</strong>
	 * The pool is bounded but also {@code shutdown()} at context close, and Boot does not run a
	 * graceful web shutdown here, so an in-flight webhook can still reach its {@code AFTER_COMMIT}
	 * dispatch after the executor stops accepting. That rejection arrives at this same handler from
	 * an <em>idle</em> pool; counting it would make every routine redeploy raise the runbook's
	 * "any increase" alert, and escalating it would print a relay-degradation message describing a
	 * condition that never happened.
	 *
	 * <p>Neither path may throw or run the task: see this class's Javadoc for why both would defeat
	 * the bulkhead. The line carries no recipient and no booking code (invariant #7); the correlation
	 * id rides the MDC.
	 *
	 * <p><strong>This class owns the pool's only {@code TaskDecorator} slot.</strong> A later slice
	 * that wants one too — #410, propagating the caller's MDC onto the mail workers, is the one in
	 * flight — must <em>compose</em> with {@link #decorate} rather than call
	 * {@code setTaskDecorator} again, which silently replaces it: the episode flag would then never
	 * clear, and after the first saturation every later one would be counted but never logged. No
	 * test would go red for the missing lines, only for their absence in {@code aLaterEpisodeLogsAgain}.
	 */
	private static final class SaturationPolicy implements RejectedExecutionHandler, TaskDecorator {

		private final Counter shed;
		private final AtomicBoolean episodeOpen = new AtomicBoolean();

		/** Captured at the first rejection — the decorator needs the queue to know when an episode ended. */
		private volatile ThreadPoolExecutor saturated;

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
			saturated = executor;
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
			ThreadPoolExecutor pool = saturated;
			if (pool == null || pool.getQueue().isEmpty()) {
				episodeOpen.set(false);
			}
		}
	}
}
