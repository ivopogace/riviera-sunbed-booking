package ai.riviera.platform;

import java.time.Duration;
import java.time.Instant;

/**
 * A small in-memory token bucket for rate limiting: holds up to {@code capacity} tokens that refill
 * at a steady rate of {@code capacity} tokens per {@code refillPeriod}. {@link #tryAcquire(Instant)}
 * spends one token if one is available. Time is supplied by the caller (the filter passes the
 * injected {@link java.time.Clock}'s instant), so the class is pure and tests advance time
 * deterministically — no {@code Instant.now()} (invariant #6 posture).
 *
 * <p>Thread-safe: a single bucket may be hit by many request threads at once, so every state read
 * and mutation is {@code synchronized}. Over-admission under contention is impossible (the spend is
 * atomic with the refill); the failure mode, if any, is fail-open, never wrongly rejecting a
 * legitimate caller.
 */
final class TokenBucket {

	private final double capacity;
	private final double tokensPerMilli;
	private final long refillMillis;
	private double tokens;
	private Instant lastRefill;

	TokenBucket(int capacity, Duration refillPeriod, Instant now) {
		if (capacity <= 0) {
			throw new IllegalArgumentException("capacity must be positive: " + capacity);
		}
		if (refillPeriod.isZero() || refillPeriod.isNegative()) {
			throw new IllegalArgumentException("refillPeriod must be positive: " + refillPeriod);
		}
		this.capacity = capacity;
		this.refillMillis = refillPeriod.toMillis();
		this.tokensPerMilli = capacity / (double) refillMillis;
		this.tokens = capacity;
		this.lastRefill = now;
	}

	/** Spend one token if available (refilling first for the elapsed time). */
	synchronized boolean tryAcquire(Instant now) {
		refill(now);
		if (tokens >= 1.0) {
			tokens -= 1.0;
			return true;
		}
		return false;
	}

	/** Whole seconds until the next token is available; {@code 0} when one is available now. */
	synchronized long retryAfterSeconds(Instant now) {
		refill(now);
		if (tokens >= 1.0) {
			return 0L;
		}
		double neededTokens = 1.0 - tokens;
		double neededMillis = neededTokens / tokensPerMilli;
		return (long) Math.ceil(neededMillis / 1000.0);
	}

	/**
	 * True when the bucket is full — it then carries no consumed state and is indistinguishable from
	 * a freshly created one, so it can be evicted from the tracking map losslessly.
	 */
	synchronized boolean isFull(Instant now) {
		refill(now);
		return tokens >= capacity;
	}

	private void refill(Instant now) {
		if (now.isAfter(lastRefill)) {
			long elapsedMillis = Duration.between(lastRefill, now).toMillis();
			tokens = Math.min(capacity, tokens + elapsedMillis * tokensPerMilli);
			lastRefill = now;
		}
	}
}
