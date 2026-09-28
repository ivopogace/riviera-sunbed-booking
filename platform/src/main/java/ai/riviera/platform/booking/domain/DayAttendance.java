package ai.riviera.platform.booking.domain;

/**
 * One service day's attendance, the Java twin of {@code booking_day}'s two stamps (V60):
 * {@code ATTENDED} once check-in stamped the day, {@code MISSED} once the no-show sweep did, else
 * {@code EXPECTED}. A day's fact, never the stay's outcome ({@link BookingStatus}).
 */
public enum DayAttendance {
	EXPECTED, ATTENDED, MISSED;

	/** The state the two stamps encode; both set is unrepresentable ({@code booking_day_outcome_check}). */
	public static DayAttendance of(boolean attended, boolean missed) {
		if (attended) {
			return ATTENDED;
		}
		return missed ? MISSED : EXPECTED;
	}
}
