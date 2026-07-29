package ai.riviera.platform.notification.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
 * queue is <em>full</em>, so a larger max would add no headroom until {@link #QUEUE_CAPACITY} sends
 * were already backed up. Two threads rather than one — unlike the recovery dispatcher, whose serial
 * drain suits "a handful of sends a day" — because this is a per-confirmed-booking send and a single
 * wedged address would otherwise serialize every later confirmation behind its full timeout budget.
 * At {@code POOL_SIZE + QUEUE_CAPACITY} the pool <strong>sheds</strong>: the rejection handler logs
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
class RegistryMailExecutorConfig {

	/**
	 * The bean name, shared as a compile-time constant with the {@code @Async} that names it, so the
	 * two cannot drift into a silent fallback onto the shared executor.
	 */
	static final String MAIL_EXECUTOR = "registryMailExecutor";

	static final int POOL_SIZE = 2;

	/** ≈50 minutes of worst-case backlog at two threads × ~30s — past that, the registry is the better queue. */
	static final int QUEUE_CAPACITY = 200;

	private static final int SHUTDOWN_DRAIN_SECONDS = 5;
	private static final String THREAD_NAME_PREFIX = "registry-mail-";

	private static final Logger log = LoggerFactory.getLogger(RegistryMailExecutorConfig.class);

	@Bean(name = MAIL_EXECUTOR, defaultCandidate = false)
	ThreadPoolTaskExecutor registryMailExecutor() {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(POOL_SIZE);
		pool.setMaxPoolSize(POOL_SIZE);
		pool.setQueueCapacity(QUEUE_CAPACITY);
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setRejectedExecutionHandler((task, executor) -> shed());
		// A short grace for sends already in flight; whatever does not finish stays outstanding.
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationSeconds(SHUTDOWN_DRAIN_SECONDS);
		return pool;
	}

	/** Never the recipient or the booking code (invariant #7); the correlation id rides the MDC. */
	private static void shed() {
		log.warn("Registry mail executor saturated; the send was shed and stays outstanding for the "
				+ "next restart's republish");
	}
}
