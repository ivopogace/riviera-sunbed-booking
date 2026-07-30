package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The bounds of the refund bulkhead ({@link RefundExecutorConfig}), externalised from the start
 * because every number here is sized against a <em>gateway</em> budget, and the gateway is changing.
 *
 * <p><strong>The sizing argument, so it can be checked rather than inherited.</strong> One refund is
 * one blocking round-trip, bounded today by Stripe's configured 5s connect + 20s read = <strong>25s</strong>
 * with no SDK retries — pinned, not assumed, by
 * {@code StripeConfigTest#theRefundBudgetIsOneRoundTripWithNoSdkRetries}. From that:
 * <ul>
 *   <li><strong>{@link #DEFAULT_POOL_SIZE} = 4.</strong> Not a throughput number — a head-of-line one.
 *       The worst realistic burst is an admin weather refund, which cancels <em>every</em> confirmed
 *       booking for one {@code (venue, date)} in a single transaction and dispatches that many refunds
 *       at once. At 2 threads (the mail pool's choice, sized for "a handful of sends a day") a
 *       60-booking venue-day against a degraded gateway would take 12.5 minutes to drain; at 4 it is
 *       ~6. Larger buys little: in the normal case a refund is sub-second and even one thread keeps up,
 *       and each extra worker is another concurrent gateway request during precisely the incident where
 *       the gateway is already unhappy.</li>
 *   <li><strong>{@link #DEFAULT_QUEUE_CAPACITY} = 500.</strong> Deep enough that shedding is unreachable
 *       for any plausible burst — several venues' worth of weather refunds in one storm — because unlike
 *       a shed mail, a shed refund is money owed under invariant #10 and its recovery is restart-only.
 *       Bounded anyway, at ≈52 minutes of worst-case backlog (500 × 25s ÷ 4), past which the Event
 *       Publication Registry is the better queue; the same reasoning #383 applied at ≈50 minutes.</li>
 *   <li><strong>{@link #DEFAULT_SHUTDOWN_DRAIN} = 30s.</strong> One full round-trip plus headroom, so a
 *       redeploy does not abandon a refund that is merely slow. Its ceiling is the platform's SIGTERM
 *       grace: a drain that outlasts it gets the process killed mid-close, which is worse than giving
 *       up cleanly.</li>
 * </ul>
 *
 * <p><strong>The values that ship live in {@code application.properties}, not here.</strong> The
 * defaults below are a backstop for a context bound without that file; production reads the
 * {@code ${RIVIERA_REFUND_*:…}} placeholders, and those placeholders are also the only reason the
 * readable env-var names work — the relaxed-binding form of {@code riviera.booking.refund.pool-size}
 * would be {@code RIVIERA_BOOKING_REFUND_POOLSIZE}. This matters more here than it did for #408:
 * ADR-0009 (epic #284) replaces the gateway outright, and the whole point of these being properties is
 * that re-deriving the numbers against Paysera's client is a config change rather than a code change.
 *
 * <p><strong>Every knob is validated here, not annotated, and on BOTH ends.</strong> A non-positive
 * {@code queue-capacity} is not harmless: {@code ThreadPoolTaskExecutor.createQueue} returns a
 * {@link java.util.concurrent.SynchronousQueue} for any capacity {@code <= 0}, so a typo would boot
 * cleanly and silently convert the bulkhead into a pool that sheds every refund it cannot hand straight
 * to a free thread — worse than the starvation this exists to prevent, and invisible. The upper bounds
 * close the same hole from the other end: {@code createQueue} returns a {@code LinkedBlockingQueue} for
 * <em>any</em> positive capacity and allocates its nodes lazily, so an absurd value boots clean, reports
 * healthy, sheds nothing, and is simply the unbounded queue this slice removed, restored by
 * configuration. A large {@code pool-size} is the mirror image — core threads are created lazily too, so
 * the failure arrives later as {@code OutOfMemoryError: unable to create native thread}, thrown from
 * {@code execute()} on the commit thread that {@link RefundExecutorConfig}'s shed handler exists to keep
 * exceptions off.
 *
 * <p>The guard is a compact constructor rather than {@code @Validated} + {@code @Min} because Boot
 * validates {@code @ConfigurationProperties} only when a JSR-303 implementation is on the classpath, and
 * there is none: #97 declined {@code spring-boot-starter-validation} deliberately, in favour of explicit
 * checks in records. An annotation here would bind and validate nothing.
 *
 * @param poolSize core <em>and</em> max threads; equal by design, since a {@code ThreadPoolExecutor}
 *        grows past core only once the queue is full
 * @param queueCapacity refunds that may back up before the pool sheds to the Event Publication Registry
 * @param shutdownDrain how long a redeploy waits for in-flight refunds before giving up on them
 */
@ConfigurationProperties("riviera.booking.refund")
record RefundExecutorProperties(Integer poolSize, Integer queueCapacity, Duration shutdownDrain) {

	static final int DEFAULT_POOL_SIZE = 4;

	static final int DEFAULT_QUEUE_CAPACITY = 500;

	static final Duration DEFAULT_SHUTDOWN_DRAIN = Duration.ofSeconds(30);

	/** 8× the shipped 4. Past this the pool stops being the small thing the spine's pool is protected from. */
	static final int MAX_POOL_SIZE = 32;

	/** 20× the shipped 500 — ≈17 hours of backlog at 4 × 25s, long past where the registry is the better queue. */
	static final int MAX_QUEUE_CAPACITY = 10_000;

	/** Below one round-trip the drain gives up on refunds that are merely slow, every single redeploy. */
	static final Duration MIN_SHUTDOWN_DRAIN = Duration.ofSeconds(1);

	/** Above the platform's SIGTERM grace the drain does not finish — the process is killed mid-close. */
	static final Duration MAX_SHUTDOWN_DRAIN = Duration.ofSeconds(60);

	RefundExecutorProperties {
		poolSize = poolSize == null ? DEFAULT_POOL_SIZE : poolSize;
		queueCapacity = queueCapacity == null ? DEFAULT_QUEUE_CAPACITY : queueCapacity;
		shutdownDrain = shutdownDrain == null ? DEFAULT_SHUTDOWN_DRAIN : shutdownDrain;
		if (poolSize <= 0 || poolSize > MAX_POOL_SIZE) {
			throw new IllegalArgumentException(
					"riviera.booking.refund.pool-size must be between 1 and " + MAX_POOL_SIZE
							+ ", but was " + poolSize + "; core threads are created lazily, so an oversized "
							+ "pool does not fail at boot — it fails later as OutOfMemoryError: unable to "
							+ "create native thread, on the commit thread this pool exists to protect");
		}
		if (queueCapacity <= 0 || queueCapacity > MAX_QUEUE_CAPACITY) {
			throw new IllegalArgumentException(
					"riviera.booking.refund.queue-capacity must be between 1 and " + MAX_QUEUE_CAPACITY
							+ ", but was " + queueCapacity + "; a non-positive capacity yields a "
							+ "SynchronousQueue, which sheds every refund that cannot be handed straight to a "
							+ "free thread, and an oversized one restores the unbounded queue this bulkhead "
							+ "exists to remove — it boots clean, sheds nothing, and fills the heap instead");
		}
		if (shutdownDrain.compareTo(MIN_SHUTDOWN_DRAIN) < 0 || shutdownDrain.compareTo(MAX_SHUTDOWN_DRAIN) > 0) {
			throw new IllegalArgumentException(
					"riviera.booking.refund.shutdown-drain must be between " + MIN_SHUTDOWN_DRAIN + " and "
							+ MAX_SHUTDOWN_DRAIN + ", but was " + shutdownDrain + "; it must cover one gateway "
							+ "round-trip or every redeploy abandons refunds that were merely slow, and it "
							+ "must stay inside the platform's SIGTERM grace or the drain never finishes — "
							+ "the process is killed mid-close instead");
		}
	}
}
