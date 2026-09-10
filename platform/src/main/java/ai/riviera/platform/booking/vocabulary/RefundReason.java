package ai.riviera.platform.booking.vocabulary;

/**
 * Why a booking was cancelled and (when money is returned) a refund issued — carried on
 * {@link BookingCancelled} and recorded on the booking row and the payout {@code REVERSAL}.
 * Published vocabulary (invariant #11): the {@code payout} module reads it off the
 * event to stamp the reversal. Mirrors the {@code cancel_reason} / {@code reason} CHECK token sets
 * (V14, widened by V52) one-to-one — keep the Java enum and the SQL tokens in lockstep.
 *
 * <ul>
 *   <li>{@link #POLICY} — a tourist cancellation under the cancellation policy (invariant #10):
 *       full before the cutoff, partial/none after.</li>
 *   <li>{@link #WEATHER} — an admin-triggered full refund for a washed-out venue/date regardless of
 *       the cutoff (invariant #10).</li>
 *   <li>{@link #CONFLICT} — reserved (an admin availability-conflict cancel); admitted by the schema
 *       now as a closed value set, not exercised in v1.</li>
 *   <li>{@link #VENUE_CHANGE} — a venue's own remodel ended the booking, or the guest took the free
 *       exit one earned them. Operator-caused throughout, and distinct from {@link #CONFLICT}, which
 *       is admin-actioned. It says nothing about the amount: a remodel refund and a free exit each
 *       return the whole booking (invariant #10), while a remodel <em>release</em> of an unpaid
 *       booking returns nothing, since nothing was collected. Which of the three a cancellation is
 *       cannot be read off this token — {@code BookingNotificationFacts#endedByRemodel} tells the
 *       venue's doing from the guest's, and a zero refund tells a release from either.</li>
 * </ul>
 */
public enum RefundReason {
	POLICY,
	WEATHER,
	CONFLICT,
	VENUE_CHANGE
}
