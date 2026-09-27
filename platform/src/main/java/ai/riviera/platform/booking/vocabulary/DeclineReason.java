package ai.riviera.platform.booking.vocabulary;

/**
 * Why a pending request was declined (ADR-0025): the venue said no ({@link #VENUE}), the accept
 * could not claim a day or a remodel disturbed the set ({@link #SET_UNAVAILABLE}), or an
 * overlapping request on the same set was accepted instead ({@link #ANOTHER_GUEST}). Stored by name
 * on {@code booking.decline_reason}: keep in lockstep with {@code booking_decline_reason_check}.
 */
public enum DeclineReason {
	VENUE,
	SET_UNAVAILABLE,
	ANOTHER_GUEST
}
