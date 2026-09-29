package ai.riviera.platform.booking.vocabulary;

/**
 * Why a booking, or one day of it, was refunded: on the booking row, the service day and the payout reversal.
 * Stored by name, in lockstep with {@code booking_cancel_reason_check}, {@code payout_reason_check} and (the two
 * day reasons) {@code booking_day_refund_reason_check}. {@link #POLICY}: the guest's cancel (#10); {@link #WEATHER}:
 * a washed-out day, the set kept (ADR-0026); {@link #VENUE}: the venue's own day refund, the day released
 * (ADR-0027); {@link #CONFLICT}: reserved, never produced; {@link #VENUE_CHANGE}: a remodel refund or release,
 * or a moved guest's free exit.
 */
public enum RefundReason {
	POLICY,
	WEATHER,
	CONFLICT,
	VENUE_CHANGE,
	VENUE
}
