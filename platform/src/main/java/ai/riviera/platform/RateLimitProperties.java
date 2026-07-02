package ai.riviera.platform;

import java.time.Duration;

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
 * @param maxTrackedKeys soft cap on tracked keys per dimension; full (idle) buckets are pruned when hit
 */
@ConfigurationProperties("riviera.ratelimit")
record RateLimitProperties(
		@DefaultValue("true") boolean enabled,
		@DefaultValue Limit perIp,
		@DefaultValue Limit perCode,
		@DefaultValue Limit login,
		@DefaultValue("100000") int maxTrackedKeys) {

	record Limit(@DefaultValue("60") int capacity, @DefaultValue("PT1M") Duration refillPeriod) {
	}
}
