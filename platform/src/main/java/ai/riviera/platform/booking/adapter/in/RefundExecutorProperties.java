package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import ai.riviera.platform.shared.ShutdownBudget;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Refund bulkhead bounds ({@link RefundExecutorConfig}): {@code pool-size} is core = max threads,
 * {@code queue-capacity} the refunds queued before shedding to the registry, {@code shutdown-drain} a
 * redeploy's wait for in-flight refunds. Sized against up to three 25s gateway calls per refund
 * ({@code RESPONSIBILITIES.md} §booking). The readable {@code RIVIERA_REFUND_*} env names work only via
 * the {@code application.properties} placeholders. Every knob is bounded at both ends in the compact
 * constructor (no Bean Validation on the classpath), because every invalid value boots clean.
 */
@ConfigurationProperties("riviera.booking.refund")
record RefundExecutorProperties(Integer poolSize, Integer queueCapacity, Duration shutdownDrain) {

	/** Sized against head-of-line delay on a weather-refund burst, not throughput. */
	static final int DEFAULT_POOL_SIZE = 4;

	/** Deep enough that shedding is unreachable for any plausible burst: a shed refund is money owed. */
	static final int DEFAULT_QUEUE_CAPACITY = 500;

	/**
	 * Far short of one round-trip on purpose: an abandoned refund stays outstanding and the next start
	 * republishes it, which cannot move money twice because the gateway checks what it holds first.
	 */
	static final Duration DEFAULT_SHUTDOWN_DRAIN = Duration.ofSeconds(5);

	/** 8× the shipped 4. Past this the pool stops being the small thing the spine's pool is protected from. */
	static final int MAX_POOL_SIZE = 32;

	/** 20× the shipped 500 — ≈17 hours of backlog, long past where the registry is the better queue. */
	static final int MAX_QUEUE_CAPACITY = 10_000;

	/** Below a second the drain gives up on the sub-second common case, every single redeploy. */
	static final Duration MIN_SHUTDOWN_DRAIN = Duration.ofSeconds(1);

	/**
	 * This pool's claim on the SIGTERM grace, equal to the default, so the knob only tunes down. Pools drain
	 * sequentially and their windows add: raise it only by re-dividing {@link ShutdownBudget}.
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
