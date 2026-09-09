package ai.riviera.platform.booking.domain;

/**
 * How close a claim's service day is when a remodel would disturb its set, measured as a duration
 * to the day's open in {@code Europe/Tirane} — never a count of calendar days, so the answer does
 * not depend on the hour the operator clicks. Held by {@code RemodelZones} (the two bounds are
 * configuration); ordered from nearest to farthest.
 */
public enum RemodelZone {
	/** The day opens within the freeze window, or already opened: the claim pins its set. */
	FROZEN,
	/** Within the refund-notice floor: the claim may move, never be refunded by a remodel. */
	MOVE_ONLY,
	/** Beyond the floor: the claim moves when a candidate exists, else it is refunded or released. */
	MOVE_OR_REFUND
}
