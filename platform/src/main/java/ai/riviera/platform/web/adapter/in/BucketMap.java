package ai.riviera.platform.web.adapter.in;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * One rate-limit dimension's {@link TokenBucket}s by key, hard-bounded by {@code maxTrackedKeys}
 * ({@link RateLimitProperties}): past the cap a new key first prunes full (idle) buckets, losslessly, and only if
 * that frees nothing resets the map. Every dimension gets its own instance, so one surface's flood never starves
 * another's.
 */
final class BucketMap {

	private static final Logger log = LoggerFactory.getLogger(BucketMap.class);

	private final Map<String, TokenBucket> buckets = new ConcurrentHashMap<>();
	private final int maxTrackedKeys;

	BucketMap(int maxTrackedKeys) {
		this.maxTrackedKeys = maxTrackedKeys;
	}

	/** Fetch or create the bucket for {@code key}, a new one sized by {@code limit}. */
	TokenBucket bucketFor(String key, RateLimitProperties.Limit limit, Instant now) {
		TokenBucket existing = buckets.get(key);
		if (existing != null) {
			return existing;
		}
		if (buckets.size() >= maxTrackedKeys) {
			buckets.values().removeIf(bucket -> bucket.isFull(now)); // lossless: full == fresh
			if (buckets.size() >= maxTrackedKeys) {
				log.debug("Rate-limit key map hit the {} cap under heavy churn — resetting", maxTrackedKeys);
				buckets.clear(); // backstop: bounds memory; only reachable under a flood the per-IP limit gates
			}
		}
		return buckets.computeIfAbsent(key, ignored -> new TokenBucket(limit.capacity(), limit.refillPeriod(), now));
	}
}
