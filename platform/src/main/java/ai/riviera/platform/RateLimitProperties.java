package ai.riviera.platform;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Tunable limits for the public booking-endpoint rate limiter (issue #56). Bound from
 * {@code riviera.ratelimit.*} (see {@code application.properties} for the shipped, documented
 * defaults). Every value is configurable per environment; {@code enabled=false} turns the limiter
 * off entirely.
 *
 * <p>A {@link Limit} is a token-bucket size: {@code capacity} requests may burst, refilling steadily
 * over {@code refillPeriod}. The per-code limit must stay comfortably above the frontend's
 * payment-confirmation poll budget (~20 GETs / 30s, {@code booking-pay.ts}) so a real payer is never
 * throttled (ADR-0006 / plan AC-5).
 *
 * @param enabled        master switch; when false no request is ever rate-limited
 * @param perIp          per-client-IP bucket, applied to all three booking endpoints
 * @param perCode        per-booking-code bucket, applied to the two code-keyed endpoints (view/cancel)
 * @param login          per-client-IP bucket for the session login (issue #109, D-8) — its own,
 *                       deliberately stricter dimension (shipped default 10/min in
 *                       {@code application.properties}) so credential guessing is throttled without
 *                       coupling to the booking budget
 * @param username       per-submitted-identity bucket for the two logins (issue #292) — keyed on the
 *                       operator {@code username} / the normalised customer {@code email}, NOT the
 *                       client IP, so guessing one account from many source addresses is throttled even
 *                       when IP attribution is imperfect. Shipped default 15/15min in
 *                       {@code application.properties}, env-overridable. Only <em>failed</em> logins
 *                       net-consume it (the filter spends a token before the request and refunds it on
 *                       any non-{@code 401} outcome), so a legitimate sign-in is never throttled by its
 *                       own success
 * @param maxTrackedKeys soft cap on tracked keys per dimension; full (idle) buckets are pruned when
 *                       hit. Bounded on both ends at bind time (issue #414) — see
 *                       {@link #MIN_TRACKED_KEY_CAP} / {@link #MAX_TRACKED_KEY_CAP}; a degenerate
 *                       value here disables the limiter without failing anything visible
 * @param trustedProxies CIDR ranges whose peers may set {@code X-Forwarded-For} (issue #129); from any
 *                       other peer the header is ignored and the socket address is the key. The
 *                       shipped value lives in {@code application.properties} — deliberately the
 *                       <em>only</em> place it is written, so the two cannot drift — and covers
 *                       loopback + the RFC1918/link-local ranges every Render internal hop uses.
 *                       Absent here it defaults to the <strong>empty</strong> list, i.e. "trust no
 *                       proxy": a security control must never grant trust nobody configured, so an
 *                       unset property throttles more, never less. See {@link ClientIpResolver}
 * @param clientIpHeader name of the header a trusted upstream edge sets to the ORIGINATING client
 *                       address (issue #286). When it is set and the socket peer is trusted, its
 *                       single value is the rate-limit key directly — no {@code X-Forwarded-For}
 *                       walk — so the trust list never has to enumerate the CDN's own rotating,
 *                       hand-copied ranges. The shipped value lives in {@code application.properties},
 *                       again the only place it is written. Absent here it defaults to
 *                       <strong>empty</strong>, i.e. "no edge header — walk only", which is exactly
 *                       the pre-#286 behaviour
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
	 * on the single Render instance (ADR-0004), i.e. the point at which the cap that exists to bound
	 * memory is itself the outage. It also catches the likeliest typo: the shipped value with one extra
	 * digit. Like the {@code RegistryMailProperties} ceilings (#408), it bounds the typo, not the operator.
	 */
	static final int MAX_TRACKED_KEY_CAP = 500_000;

	/**
	 * Validated here, not annotated: Boot validates {@code @ConfigurationProperties} only when a JSR-303
	 * implementation is on the classpath, and there is none — #97 declined
	 * {@code spring-boot-starter-validation} deliberately, in favour of explicit checks in records
	 * ({@code riviera-java-conventions} §2/§6b). An annotation here would bind and validate nothing,
	 * which is the same silent degradation reached from the other side.
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
