package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Everything the "your spot changed" email renders — structured, not pre-rendered, so each
 * {@link Mailer} decides its presentation: the guest's arrival code (unchanged by the move;
 * invariant #7: mailed, never logged), the venue, the first and last day, the spot left and the
 * spot now held with the distance, the full-refund free-exit deadline (UTC {@link Instant}, shown
 * in {@code Europe/Tirane}, invariant #6) and the code-gated link to cancel. Module-internal,
 * public for its adapters. Rationale: RESPONSIBILITIES.md §notification.
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
