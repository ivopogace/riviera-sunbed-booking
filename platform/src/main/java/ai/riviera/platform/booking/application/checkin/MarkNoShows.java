package ai.riviera.platform.booking.application.checkin;

/**
 * Resolves what the guest's absence left behind — the counterpart of {@link CheckInBooking}. A
 * service day that passed unattended is marked missed, and a {@code CONFIRMED} stay whose last
 * service day has passed takes its outcome: {@code COMPLETED} when some service day was attended,
 * {@code NO_SHOW} when none was.
 */
public interface MarkNoShows {

	/**
	 * Marks every {@code CONFIRMED} booking's unattended, unmarked service day before today
	 * (Tirane) missed, then resolves every {@code CONFIRMED} booking whose last service day is
	 * before today; returns how many resolved. Idempotent — a repeated run matches nothing.
	 */
	int sweep();
}
