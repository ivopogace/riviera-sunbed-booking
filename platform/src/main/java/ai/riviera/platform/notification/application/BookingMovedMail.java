package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Everything the "your spot changed" email renders — structured, not pre-rendered, so each
 * {@link Mailer} decides its presentation, as {@link BookingCancellationMail} does: the guest's
 * arrival code (unchanged by the move, and the reference a guest with several bookings knows the
 * booking by — invariant #7: mailed, never logged), the venue, the first and last day, the spot left
 * and the spot now held with the distance, the free-exit deadline until which a cancellation refunds
 * in full (UTC {@link Instant}, rendered in {@code Europe/Tirane} at the transport, invariant #6), and
 * the code-gated link where that cancel lives. Module-internal value, public for the module's own adapters.
 */
public record BookingMovedMail(String bookingCode, String venueName, LocalDate bookingDate, LocalDate lastDate,
		String fromRowLabel, int fromPositionNo, String toRowLabel, int toPositionNo, int rowsAway,
		int positionsAway, Instant freeExitUntil, URI bookingLink) {

	/** A one-day booking: its last day is its first. */
	public BookingMovedMail(String bookingCode, String venueName, LocalDate bookingDate, String fromRowLabel,
			int fromPositionNo, String toRowLabel, int toPositionNo, int rowsAway, int positionsAway,
			Instant freeExitUntil, URI bookingLink) {
		this(bookingCode, venueName, bookingDate, bookingDate, fromRowLabel, fromPositionNo, toRowLabel,
				toPositionNo, rowsAway, positionsAway, freeExitUntil, bookingLink);
	}
}
