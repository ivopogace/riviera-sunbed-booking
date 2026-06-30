package ai.riviera.platform.booking.infrastructure;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The TTL for the abandoned-payment sweep (issue #51), bound from {@code booking.awaiting-payment.ttl}:
 * how long a booking may stay {@code AWAITING_PAYMENT} before it is considered abandoned and swept.
 * Default 15 minutes — comfortably longer than a real Stripe checkout, so a live payer is never swept,
 * yet short enough to free an abandoned set the same day. A {@link Duration} parsed from an ISO-8601 /
 * Spring duration string (e.g. {@code PT15M}, {@code 15m}); passed into the use case so the application
 * layer holds no configuration type.
 *
 * <p>The scheduler's cadence ({@code sweep-interval}, {@code initial-delay}) is <em>not</em> here — it
 * is consumed only by the {@code @Scheduled} placeholders on {@code AbandonedBookingScheduler}, so it
 * has no programmatic reader and is deliberately kept out of this record. Enabled under the
 * {@code stripe} profile only (see {@code BookingSchedulingConfig}) — the default stub profile confirms
 * synchronously, so no booking ever lingers {@code AWAITING_PAYMENT}.
 */
@ConfigurationProperties("booking.awaiting-payment")
public record AbandonedPaymentProperties(Duration ttl) {

	private static final Duration DEFAULT_TTL = Duration.ofMinutes(15);

	public AbandonedPaymentProperties {
		ttl = ttl == null ? DEFAULT_TTL : ttl;
	}
}
