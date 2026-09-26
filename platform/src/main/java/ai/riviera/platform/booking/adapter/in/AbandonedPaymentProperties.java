package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The abandoned-payment sweep's TTL, bound from {@code booking.awaiting-payment.ttl} (e.g. {@code PT15M}
 * or {@code 15m}) and validated in the compact constructor: no Bean Validation is on the classpath, so
 * {@code @Min} would check nothing. The sweep runs under the {@code stripe} profile only.
 *
 * @param ttl how long a booking may stay {@code AWAITING_PAYMENT}; default {@code PT15M} (longer than a
 *        real checkout, short enough to free the set the same day), {@link #MIN_TTL} to {@link #MAX_TTL}
 */
@ConfigurationProperties("booking.awaiting-payment")
public record AbandonedPaymentProperties(Duration ttl) {

	private static final Duration DEFAULT_TTL = Duration.ofMinutes(15);

	/**
	 * Floor: card entry plus 3-D Secure does not finish inside a minute, so a shorter TTL sweeps a payer who
	 * is still typing and releases their set to a second party (invariant #2).
	 */
	static final Duration MIN_TTL = Duration.ofMinutes(1);

	/**
	 * Ceiling: only the TTL frees a same-day-born abandoned set (sales can run to D itself, invariant #4),
	 * so a longer TTL leaves the set dead for the one day it could have been sold.
	 */
	static final Duration MAX_TTL = Duration.ofHours(24);

	public AbandonedPaymentProperties {
		ttl = ttl == null ? DEFAULT_TTL : ttl;
		if (ttl.compareTo(MIN_TTL) < 0 || ttl.compareTo(MAX_TTL) > 0) {
			throw new IllegalArgumentException(
					"booking.awaiting-payment.ttl must be between " + MIN_TTL + " and " + MAX_TTL
							+ ", but was " + ttl + "; the sweep expires bookings older than now.minus(ttl), "
							+ "so a zero or negative TTL reaps every booking the instant it is created — "
							+ "releasing the set under a payer who is still in Stripe checkout — while an "
							+ "oversized one can no longer free a set before the date it was claimed for");
		}
	}
}
