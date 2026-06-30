package ai.riviera.platform.booking.api;

/**
 * Why a booking was cancelled and (when money is returned) a refund issued — carried on
 * {@link BookingCancelled} and recorded on the booking row and the payout {@code REVERSAL} (U9,
 * issue #12). Published vocabulary (invariant #11): the {@code payout} module reads it off the
 * event to stamp the reversal. Mirrors the {@code cancel_reason} / {@code reason} CHECK token sets
 * (V14) one-to-one — keep the Java enum and the SQL tokens in lockstep.
 *
 * <ul>
 *   <li>{@link #POLICY} — a tourist cancellation under the cancellation policy (U6, invariant #10):
 *       full before the cutoff, partial/none after.</li>
 *   <li>{@link #WEATHER} — an admin-triggered full refund for a washed-out venue/date regardless of
 *       the cutoff (U9, invariant #10).</li>
 *   <li>{@link #CONFLICT} — reserved (an admin availability-conflict cancel); admitted by the schema
 *       now as a closed value set, not exercised in v1.</li>
 * </ul>
 */
public enum RefundReason {
	POLICY,
	WEATHER,
	CONFLICT
}
