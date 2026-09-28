package ai.riviera.platform.booking.domain;

/**
 * One service day's attendance, the Java twin of {@code booking_day}'s stamps (V60, V68):
 * {@code ATTENDED} once check-in stamped the day, {@code REFUNDED} once the weather refund did (the
 * day is neither attended nor missed, whatever else was stamped), {@code MISSED} once the no-show
 * sweep did, else {@code EXPECTED}. A day's fact, never the stay's outcome ({@link BookingStatus}).
 */
public enum DayAttendance {
	EXPECTED, ATTENDED, MISSED, REFUNDED;

	/** The state the stamps encode; attended and refunded together is unrepresentable ({@code booking_day_refunded_check}). */
	public static DayAttendance of(boolean attended, boolean missed, boolean refunded) {
		if (refunded) {
			return REFUNDED;
		}
		if (attended) {
			return ATTENDED;
		}
		return missed ? MISSED : EXPECTED;
	}

	/** The pre-V68 reading: no refund stamp. */
	public static DayAttendance of(boolean attended, boolean missed) {
		return of(attended, missed, false);
	}
}
