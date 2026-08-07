package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import ai.riviera.platform.shared.ShutdownBudget;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The bounds of the refund bulkhead ({@link RefundExecutorConfig}), externalised because every number
 * here is sized against a <em>gateway</em> budget — one refund is one blocking round-trip, bounded
 * today at 25s by Stripe's configured connect + read timeouts with no SDK retries (pinned by
 * {@code StripeConfigTest}). The full sizing argument: {@code RESPONSIBILITIES.md} §{@code booking}.
 *
 * <p>The shipped values live in {@code application.properties}; the defaults below are a backstop for a
 * context bound without it. The {@code ${RIVIERA_REFUND_*:…}} placeholders are also the only reason the
 * readable env-var names work — relaxed binding of {@code riviera.booking.refund.pool-size} would be
 * {@code RIVIERA_BOOKING_REFUND_POOLSIZE}.
 *
 * <p><strong>Every knob is validated on BOTH ends, because every invalid value boots clean.</strong>
 * {@code ThreadPoolTaskExecutor.createQueue} returns a {@link java.util.concurrent.SynchronousQueue}
 * for any capacity {@code <= 0}, silently converting the bulkhead into a pool that sheds every refund
 * it cannot hand straight to a free thread. At the other end it returns a {@code LinkedBlockingQueue}
 * for <em>any</em> positive capacity and allocates lazily, so an absurd value is just the unbounded
 * queue this bulkhead removed, restored by configuration. Core threads are created lazily too, so an
 * oversized pool fails later as {@code OutOfMemoryError: unable to create native thread} — on the very
 * commit thread {@link RefundExecutorConfig}'s shed handler exists to keep exceptions off.
 *
 * <p>A compact constructor rather than {@code @Validated} + {@code @Min}: Boot validates
 * {@code @ConfigurationProperties} only with a JSR-303 implementation on the classpath, and there is
 * none by deliberate choice, so an annotation here would validate nothing.
 *
 * @param poolSize core <em>and</em> max threads; equal by design, since a {@code ThreadPoolExecutor}
 *        grows past core only once the queue is full
 * @param queueCapacity refunds that may back up before the pool sheds to the Event Publication Registry
 * @param shutdownDrain how long a redeploy waits for in-flight refunds before giving up on them
 */
@ConfigurationProperties("riviera.booking.refund")
record RefundExecutorProperties(Integer poolSize, Integer queueCapacity, Duration shutdownDrain) {

	/** Sized against head-of-line delay on a weather-refund burst, not throughput. */
	static final int DEFAULT_POOL_SIZE = 4;

	/** Deep enough that shedding is unreachable for any plausible burst: a shed refund is money owed. */
	static final int DEFAULT_QUEUE_CAPACITY = 500;

	/**
	 * Deliberately far short of one round-trip. Abandoning a refund is cheap — the publication stays
	 * outstanding, the next start republishes, and the {@code booking-<id>-refund} idempotency key makes
	 * the replay return the original rather than move money twice — so the drain need only catch the
	 * sub-second common case.
	 */
	static final Duration DEFAULT_SHUTDOWN_DRAIN = Duration.ofSeconds(5);

	/** 8× the shipped 4. Past this the pool stops being the small thing the spine's pool is protected from. */
	static final int MAX_POOL_SIZE = 32;

	/** 20× the shipped 500 — ≈17 hours of backlog, long past where the registry is the better queue. */
	static final int MAX_QUEUE_CAPACITY = 10_000;

	/** Below a second the drain gives up on the sub-second common case, every single redeploy. */
	static final Duration MIN_SHUTDOWN_DRAIN = Duration.ofSeconds(1);

	/**
	 * This pool's claim on the platform's SIGTERM grace — equal to the default, so the knob exists to
	 * turn it <strong>down</strong>. Raising it is not tuning but a re-division of a platform-wide
	 * budget: pools drain SEQUENTIALLY at context close, so windows add rather than overlap. Do that in
	 * {@link ShutdownBudget}, where every pool's claim is stated together and the sum is checked.
	 */
	static final Duration MAX_SHUTDOWN_DRAIN = Duration.ofMillis(ShutdownBudget.REFUND_POOL_CLAIM_MS);

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
							+ MAX_SHUTDOWN_DRAIN + ", but was " + shutdownDrain + "; below the floor every "
							+ "redeploy abandons the sub-second common case, and above the ceiling this pool "
							+ "overspends its share of the platform's SIGTERM grace — pools drain "
							+ "SEQUENTIALLY at context close, so this window ADDS to the two mail pools' 20s "
							+ "rather than overlapping it, and the process is killed mid-close instead");
		}
	}
}
