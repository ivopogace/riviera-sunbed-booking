package ai.riviera.platform.booking.application.checkin;

/**
 * Resolves what the guest's absence left behind — the counterpart of {@link CheckInBooking}. A
 * night that passed unattended is marked missed, and a {@code CONFIRMED} stay whose last night has
 * passed takes its outcome: {@code COMPLETED} when some night was attended, {@code NO_SHOW} when
 * none was.
 */
public interface MarkNoShows {

	/**
	 * Mark every night before today in {@code Europe/Tirane} that a {@code CONFIRMED} booking neither
	 * attended nor missed as missed, then resolve every {@code CONFIRMED} booking whose last night is
	 * before today; returns how many bookings resolved. Idempotent — a repeated run matches nothing.
	 */
	int sweep();
}
