package ai.riviera.platform.booking.vocabulary;

/** Why a claim blocks a remodel: its set must stay in the save either way. */
public enum BlockReason {
	/** The service day opens within the freeze window, or already opened. */
	FROZEN,
	/** Within the refund-notice floor with no free set of the same or better tier on that date. */
	NO_MOVE_CANDIDATE
}
