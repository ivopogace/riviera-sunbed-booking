package ai.riviera.platform.booking.infrastructure;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Tunables for the abandoned-payment TTL sweep (issue #51), bound from {@code booking.awaiting-payment.*}.
 *
 * <ul>
 *   <li>{@code ttl} — how long a booking may stay {@code AWAITING_PAYMENT} before it is considered
 *       abandoned and swept. Default 15 minutes: comfortably longer than a real Stripe checkout, so a
 *       live payer is never swept, yet short enough to free an abandoned set the same day.</li>
 *   <li>{@code sweepInterval} — how often the scheduler runs (also referenced directly by the
 *       {@code @Scheduled(fixedDelayString=…)} placeholder). Default 5 minutes.</li>
 * </ul>
 *
 * <p>Both are {@link Duration}s parsed from ISO-8601 / Spring duration strings (e.g. {@code PT15M},
 * {@code 15m}). Enabled under the {@code stripe} profile only (see {@code BookingSchedulingConfig}) —
 * the default stub profile confirms synchronously, so no booking ever lingers {@code AWAITING_PAYMENT}.
 */
@ConfigurationProperties("booking.awaiting-payment")
public record AbandonedPaymentProperties(Duration ttl, Duration sweepInterval) {

	private static final Duration DEFAULT_TTL = Duration.ofMinutes(15);
	private static final Duration DEFAULT_SWEEP_INTERVAL = Duration.ofMinutes(5);

	public AbandonedPaymentProperties {
		ttl = ttl == null ? DEFAULT_TTL : ttl;
		sweepInterval = sweepInterval == null ? DEFAULT_SWEEP_INTERVAL : sweepInterval;
	}
}
