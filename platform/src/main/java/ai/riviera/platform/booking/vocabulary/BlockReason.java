package ai.riviera.platform.booking.vocabulary;

/** Why a remodel keeps a claim where it is, leaving its set as stored either way. */
public enum BlockReason {
	/** The service day opens within the freeze window, or already opened. */
	FROZEN,
	/** Within the refund-notice floor with no set of the same or better tier free on every day of the booking. */
	NO_MOVE_CANDIDATE
}
