package ai.riviera.platform;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins the pure token-bucket math (issue #56): capacity is the burst, tokens refill steadily over
 * the period, and {@code retryAfterSeconds} reports the wait when empty. Time is supplied by the
 * caller, so the test advances a fixed {@link Instant} by hand — no Spring, no clock, no sleep.
 */
class TokenBucketTest {

	private static final Instant T0 = Instant.parse("2026-06-30T10:00:00Z");

	@Test
	void allowsUpToCapacityThenRefuses() {
		TokenBucket bucket = new TokenBucket(3, Duration.ofSeconds(30), T0);

		assertTrue(bucket.tryAcquire(T0));
		assertTrue(bucket.tryAcquire(T0));
		assertTrue(bucket.tryAcquire(T0));
		assertFalse(bucket.tryAcquire(T0), "4th acquire within the same instant must be refused");
	}

	@Test
	void refillsOverTime() {
		TokenBucket bucket = new TokenBucket(3, Duration.ofSeconds(30), T0);
		for (int i = 0; i < 3; i++) {
			bucket.tryAcquire(T0);
		}
		assertFalse(bucket.tryAcquire(T0));

		// A full period later the bucket is back to capacity.
		Instant later = T0.plusSeconds(30);
		assertTrue(bucket.tryAcquire(later));
		assertTrue(bucket.tryAcquire(later));
		assertTrue(bucket.tryAcquire(later));
		assertFalse(bucket.tryAcquire(later));
	}

	@Test
	void partialRefill() {
		// 10 tokens / 10s = 1 token per second.
		TokenBucket bucket = new TokenBucket(10, Duration.ofSeconds(10), T0);
		for (int i = 0; i < 10; i++) {
			assertTrue(bucket.tryAcquire(T0));
		}
		assertFalse(bucket.tryAcquire(T0));

		// 5 seconds later → exactly 5 tokens back.
		Instant t5 = T0.plusSeconds(5);
		for (int i = 0; i < 5; i++) {
			assertTrue(bucket.tryAcquire(t5), "token " + i + " should be available after 5s");
		}
		assertFalse(bucket.tryAcquire(t5), "only 5 tokens refill in 5s");
	}

	@Test
	void neverExceedsCapacityOnLongIdle() {
		TokenBucket bucket = new TokenBucket(2, Duration.ofSeconds(10), T0);
		bucket.tryAcquire(T0);

		// Idle for an hour — must cap at capacity, not accumulate unboundedly.
		Instant muchLater = T0.plusSeconds(3600);
		assertTrue(bucket.tryAcquire(muchLater));
		assertTrue(bucket.tryAcquire(muchLater));
		assertFalse(bucket.tryAcquire(muchLater));
	}

	@Test
	void retryAfterSecondsReportsWaitWhenEmpty() {
		// 2 tokens / 10s = one token every 5 seconds.
		TokenBucket bucket = new TokenBucket(2, Duration.ofSeconds(10), T0);
		bucket.tryAcquire(T0);
		bucket.tryAcquire(T0);

		assertEquals(5L, bucket.retryAfterSeconds(T0), "next token in 5s when empty");
		assertEquals(0L, bucket.retryAfterSeconds(T0.plusSeconds(5)), "0 once a token is available");
	}

	@Test
	void isFullOnlyWhenReplenished() {
		TokenBucket bucket = new TokenBucket(2, Duration.ofSeconds(10), T0);
		assertTrue(bucket.isFull(T0));
		bucket.tryAcquire(T0);
		assertFalse(bucket.isFull(T0));
		assertTrue(bucket.isFull(T0.plusSeconds(10)), "back to full after a period");
	}

	@Test
	void rejectsInvalidConfig() {
		assertThrows(IllegalArgumentException.class, () -> new TokenBucket(0, Duration.ofSeconds(1), T0));
		assertThrows(IllegalArgumentException.class, () -> new TokenBucket(1, Duration.ZERO, T0));
		assertThrows(IllegalArgumentException.class, () -> new TokenBucket(1, Duration.ofSeconds(-1), T0));
	}
}
