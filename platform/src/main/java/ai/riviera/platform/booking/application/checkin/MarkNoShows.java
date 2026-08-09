package ai.riviera.platform.booking.application.checkin;

/**
 * Marks bookings whose service day passed without a check-in as no-shows — the counterpart of
 * {@link CheckInBooking}. Check-in is the only path to {@code COMPLETED}, so a past-day booking
 * still sitting at {@code CONFIRMED} is precisely the guest who never arrived.
 */
public interface MarkNoShows {

	/**
	 * Mark every {@code CONFIRMED} booking dated before today in {@code Europe/Tirane} as
	 * {@code NO_SHOW}; returns how many transitioned. Idempotent — a repeated run matches nothing.
	 */
	int sweep();
}
