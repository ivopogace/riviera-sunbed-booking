package ai.riviera.platform.web.adapter.in;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins the tracked-key bound every rate-limit dimension shares: a key keeps its bucket, past the cap a full
 * (idle) bucket is pruned without losing anyone's spent tokens, and only when nothing is full does the map reset.
 */
class BucketMapTest {

	private static final Instant T0 = Instant.parse("2026-11-15T10:00:00Z");
	private static final RateLimitProperties.Limit LIMIT = new RateLimitProperties.Limit(2, Duration.ofHours(1));

	@Test
	void aKeyKeepsItsBucket() {
		BucketMap buckets = new BucketMap(2);

		assertSame(buckets.bucketFor("a", LIMIT, T0), buckets.bucketFor("a", LIMIT, T0));
	}

	@Test
	void pastTheCapAFullBucketIsPrunedAndASpentOneKept() {
		BucketMap buckets = new BucketMap(2);
		TokenBucket spent = buckets.bucketFor("spent", LIMIT, T0);
		spent.tryAcquire(T0);
		TokenBucket idle = buckets.bucketFor("idle", LIMIT, T0);

		buckets.bucketFor("new", LIMIT, T0);

		assertSame(spent, buckets.bucketFor("spent", LIMIT, T0), "a spent bucket survives the prune");
		assertNotSame(idle, buckets.bucketFor("idle", LIMIT, T0), "a full bucket is evicted, losing nothing");
	}

	@Test
	void whenNothingIsFullTheMapResets() {
		BucketMap buckets = new BucketMap(2);
		TokenBucket first = buckets.bucketFor("first", LIMIT, T0);
		first.tryAcquire(T0);
		buckets.bucketFor("second", LIMIT, T0).tryAcquire(T0);

		buckets.bucketFor("third", LIMIT, T0);

		TokenBucket fresh = buckets.bucketFor("first", LIMIT, T0);
		assertNotSame(first, fresh);
		assertTrue(fresh.isFull(T0));
		assertFalse(first.isFull(T0));
	}
}
