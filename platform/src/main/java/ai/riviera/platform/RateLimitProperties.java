package ai.riviera.platform;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Tunable limits for {@link RateLimitFilter}, bound from {@code riviera.ratelimit.*}; the shipped,
 * documented values live in {@code application.properties}. {@code enabled=false} turns the limiter off
 * entirely.
 *
 * <p>A {@link Limit} is a token-bucket size: {@code capacity} requests may burst, refilling steadily
 * over {@code refillPeriod}. The per-code limit must stay comfortably above the frontend's
 * payment-confirmation poll budget (~20 GETs / 30s) so a real payer is never throttled (ADR-0006).
 *
 * @param enabled        master switch; when false no request is ever rate-limited
 * @param perIp          per-client-IP bucket, applied to all eight booking endpoints
 * @param perCode        per-booking-code bucket for the six code-keyed endpoints, which share one
 *                       budget per code — the same secret
 * @param login          per-client-IP bucket for the session logins, deliberately stricter than the
 *                       booking budget and on its own dimension, so tightening one never starves the
 *                       other
 * @param username       per-submitted-identity bucket for the two logins — keyed on the operator
 *                       {@code username} / the normalised customer {@code email}, NOT the client IP, so
 *                       guessing one account from many source addresses is throttled even when IP
 *                       attribution is imperfect. Only <em>failed</em> logins net-consume it, so a
 *                       legitimate sign-in is never throttled by its own success
 * @param maxTrackedKeys soft cap on tracked keys per dimension; full (idle) buckets are pruned when
 *                       hit. Bounded on both ends at bind time — see {@link #MIN_TRACKED_KEY_CAP} /
 *                       {@link #MAX_TRACKED_KEY_CAP}, which exist because a degenerate value disabled
 *                       the limiter without failing anything visible
 * @param trustedProxies CIDR ranges whose peers may set {@code X-Forwarded-For}; from any other peer the
 *                       header is ignored and the socket address is the key. The shipped value lives in
 *                       {@code application.properties}, deliberately the <em>only</em> place it is
 *                       written. Absent here it defaults to the <strong>empty</strong> list — "trust no
 *                       proxy" — because a security control must never grant trust nobody configured, so
 *                       an unset property throttles more, never less. See {@link ClientIpResolver}
 * @param clientIpHeader name of the header a trusted upstream edge sets to the ORIGINATING client
 *                       address. Set, and behind a trusted peer, its single value is the key directly —
 *                       no {@code X-Forwarded-For} walk — so the trust list never has to enumerate the
 *                       CDN's own rotating ranges. Defaults to <strong>empty</strong>: walk only
 */
@ConfigurationProperties("riviera.ratelimit")
record RateLimitProperties(
		@DefaultValue("true") boolean enabled,
		@DefaultValue Limit perIp,
		@DefaultValue Limit perCode,
		@DefaultValue Limit login,
		@DefaultValue Limit username,
		@DefaultValue("100000") int maxTrackedKeys,
		@DefaultValue List<String> trustedProxies,
		@DefaultValue("") String clientIpHeader) {

	/**
	 * Below this the cap stops being the flood backstop {@link RateLimitFilter} documents and becomes
	 * the steady state: ordinary traffic — CGNAT / venue-WiFi fan-out on the per-IP dimension, a modest
	 * scan on the per-code one — reaches it, and every new key then {@code clear()}s the map, handing
	 * back every OTHER key's spent tokens. That converts a memory bound into a rate-limit bypass, which
	 * is why the floor is not {@code 1}. A thousand buckets is tens of kilobytes; nothing legitimate
	 * needs less.
	 */
	static final int MIN_TRACKED_KEY_CAP = 1_000;

	/**
	 * 5× the shipped 100 000. {@link RateLimitFilter} holds <strong>ten</strong> dimension maps, each
	 * capped independently, so this ceiling still admits ≈5 000 000 live buckets — hundreds of megabytes
	 * on the single instance (ADR-0004), i.e. the point at which the cap that exists to bound memory is
	 * itself the outage. It also catches the likeliest typo: the shipped value with one extra digit.
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
							+ "growth the cap exists to prevent, across ten dimension maps");
		}
	}

	record Limit(@DefaultValue("60") int capacity, @DefaultValue("PT1M") Duration refillPeriod) {
	}
}
