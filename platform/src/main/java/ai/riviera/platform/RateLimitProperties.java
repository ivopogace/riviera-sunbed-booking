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
 *                       consume it (the filter counts a token after a {@code 401}), so a legitimate
 *                       sign-in is never throttled
 * @param maxTrackedKeys soft cap on tracked keys per dimension; full (idle) buckets are pruned when hit
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

	record Limit(@DefaultValue("60") int capacity, @DefaultValue("PT1M") Duration refillPeriod) {
	}
}
