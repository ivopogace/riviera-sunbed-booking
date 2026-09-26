package ai.riviera.platform;

import java.time.Duration;
import java.time.Instant;

/**
 * An in-memory token bucket: up to {@code capacity} tokens, refilling at {@code capacity} per
 * {@code refillPeriod}; {@link #tryAcquire(Instant)} spends one if available. The caller supplies
 * time (the filter's injected {@link java.time.Clock}), never {@code Instant.now()} (invariant #6
 * posture), so tests advance it deterministically. Thread-safe per bucket: all state access is
 * {@code synchronized}, each spend atomic with its refill. The filter's map pruning is outside this
 * lock: a bucket evicted mid-use may rarely admit one extra request (fail-open, never false-deny).
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

	/**
	 * Return one token (capped at capacity), refilling first. The refund half of the login gate's
	 * spend-then-refund: the filter spends via {@link #tryAcquire} before the request and releases
	 * on any non-failed outcome, so only a failed authentication net-consumes a token.
	 */
	synchronized void release(Instant now) {
		refill(now);
		tokens = Math.min(capacity, tokens + 1.0);
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
