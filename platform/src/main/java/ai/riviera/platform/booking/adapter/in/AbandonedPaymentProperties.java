package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The TTL for the abandoned-payment sweep, bound from {@code booking.awaiting-payment.ttl}:
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
 *
 * <p><strong>The TTL is bounded at both ends, because both typos boot cleanly on the money
 * path.</strong> {@code AbandonedBookingSweepService} asks for bookings older than
 * {@code now.minus(ttl)}, so {@code PT0S} makes every {@code AWAITING_PAYMENT} booking expirable the
 * instant it is inserted: the sweep cancels the PaymentIntent and releases the {@code (set, date)} claim
 * (invariant #2) while its tourist is still in Stripe checkout, and a second party can then legitimately
 * claim the set. The far end is quieter — see {@link #MAX_TTL}.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated} + {@code @Min} because
 * Boot validates {@code @ConfigurationProperties} only when a JSR-303 implementation is on the
 * classpath, and there is none: the project declined {@code spring-boot-starter-validation}
 * deliberately, in favour of explicit checks in records. An annotation here would bind and validate
 * nothing — the same silent degradation, reached from the other side. Prior art:
 * {@code RegistryMailProperties}, {@code CustomerRetentionProperties}.
 *
 * @param ttl how long a booking may stay {@code AWAITING_PAYMENT}; default {@code PT15M}, bounded by
 *        {@link #MIN_TTL} and {@link #MAX_TTL}
 */
@ConfigurationProperties("booking.awaiting-payment")
public record AbandonedPaymentProperties(Duration ttl) {

	private static final Duration DEFAULT_TTL = Duration.ofMinutes(15);

	/**
	 * A minute is already below anything this TTL can honestly promise: card entry plus a 3-D Secure
	 * challenge does not finish inside one, so a shorter TTL sweeps a payer who is still typing —
	 * the same defect as {@code PT0S}, just met less often and therefore harder to attribute. The
	 * floor is not "any positive duration" for exactly that reason.
	 */
	static final Duration MIN_TTL = Duration.ofMinutes(1);

	/**
	 * 96× the shipped 15 minutes. The TTL is the only thing that returns an abandoned set to the pool,
	 * and bookings close the evening before the date they are for (invariant #4) — so past a day a
	 * booking created near that cutoff is never swept before its own booking date, and the set is dead
	 * for the one day it could have been sold. Beyond this the sweep still runs; it just can no longer
	 * do the job its Javadoc claims ("short enough to free an abandoned set the same day").
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
