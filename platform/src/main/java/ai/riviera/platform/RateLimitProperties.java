package ai.riviera.platform;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@link RateLimitFilter} limits from {@code riviera.ratelimit.*} (shipped values in {@code application.properties});
 * buckets are in-process, so single-instance only (ADR-0004). A {@link Limit} bursts {@code capacity}, refilled over
 * {@code refillPeriod}; {@code perCode} must stay well above the payment poll (~20 GETs / 30s, ADR-0006). {@code username}
 * keys the submitted identity, not the IP, and only failed logins net-consume it. {@code trustedProxies} defaults to
 * empty — trust no proxy, so an unset value throttles more, never less — and {@code clientIpHeader} is honoured only
 * behind a trusted peer. Verify on deploy: docs/runbooks/rate-limit-client-ip.md.
 */
@ConfigurationProperties("riviera.ratelimit")
record RateLimitProperties(
		@DefaultValue("true") boolean enabled,
		@DefaultValue Limit perIp,
		@DefaultValue Limit perCode,
		@DefaultValue Limit login,
		@DefaultValue Limit username,
		@DefaultValue Limit challenge,
		@DefaultValue("100000") int maxTrackedKeys,
		@DefaultValue List<String> trustedProxies,
		@DefaultValue("") String clientIpHeader) {

	/**
	 * Floor for {@code maxTrackedKeys}: below it ordinary traffic (CGNAT, venue WiFi) hits the cap, and each new key's
	 * {@code clear()} hands back every other key's spent tokens — a memory bound turned into a rate-limit bypass.
	 */
	static final int MIN_TRACKED_KEY_CAP = 1_000;

	/**
	 * Ceiling, 5× the shipped 100 000: each of the eleven dimension maps is capped independently, so more risks hundreds
	 * of megabytes on the single instance (ADR-0004). Also catches the shipped value typed with one extra digit.
	 */
	static final int MAX_TRACKED_KEY_CAP = 500_000;

	/**
	 * Validated here, not annotated: Boot validates {@code @ConfigurationProperties} only with a JSR-303
	 * implementation on the classpath, and there is none by deliberate choice, so an annotation here
	 * would bind and validate nothing.
	 */
	RateLimitProperties {
		if (maxTrackedKeys < MIN_TRACKED_KEY_CAP || maxTrackedKeys > MAX_TRACKED_KEY_CAP) {
			throw new IllegalArgumentException(
					"riviera.ratelimit.max-tracked-keys must be between " + MIN_TRACKED_KEY_CAP + " and "
							+ MAX_TRACKED_KEY_CAP + ", but was " + maxTrackedKeys
							+ "; the map-bounding check is size() >= cap, so a non-positive cap fires on "
							+ "every new key and clears every other key's spent tokens — the limiter boots "
							+ "clean and throttles nobody — while an oversized one restores the unbounded "
							+ "growth the cap exists to prevent, across eleven dimension maps");
		}
	}

	record Limit(@DefaultValue("60") int capacity, @DefaultValue("PT1M") Duration refillPeriod) {
	}
}
