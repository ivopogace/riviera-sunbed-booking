package ai.riviera.platform.booking.vocabulary;

/**
 * Why a booking was cancelled: recorded on the booking row and, via {@link BookingCancelled}, on the
 * payout {@code REVERSAL}. Stored by name: keep in lockstep with
 * {@code booking_cancel_reason_check} and {@code payout_reason_check}. {@link #POLICY}: the guest's
 * cancel (invariant #10); {@link #WEATHER}: the admin's full refund; {@link #CONFLICT}: reserved,
 * never produced. {@link #VENUE_CHANGE}: a remodel refund or release, or a moved guest's free exit —
 * told apart by a zero refund and {@code BookingNotificationFacts#endedByRemodel}.
 */
public enum RefundReason {
	POLICY,
	WEATHER,
	CONFLICT,
	VENUE_CHANGE
}
