package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;

/**
 * What the "your spot changed" email renders, structured so each {@link Mailer} picks its presentation:
 * the arrival code (unchanged; invariant #7: mailed, never logged), the venue, the days, the spot left and
 * the spot held with the distance, the free-exit deadline (UTC, shown in {@code Europe/Tirane}, #6;
 * {@code null} once a stay has begun), whether it is a stay's stretch (the exit then refunds these days,
 * not the stay) and the code-gated link. Public for its adapters. Rationale: RESPONSIBILITIES.md §notification.
 */
public record BookingMovedMail(String bookingCode, String venueName, LocalDate bookingDate, LocalDate lastDate,
		String fromRowLabel, int fromPositionNo, String toRowLabel, int toPositionNo, int rowsAway,
		int positionsAway, Instant freeExitUntil, boolean stretch, URI bookingLink) {

	/** A one-day lone booking: its last day is its first. */
	public BookingMovedMail(String bookingCode, String venueName, LocalDate bookingDate, String fromRowLabel,
			int fromPositionNo, String toRowLabel, int toPositionNo, int rowsAway, int positionsAway,
			Instant freeExitUntil, URI bookingLink) {
		this(bookingCode, venueName, bookingDate, bookingDate, fromRowLabel, fromPositionNo, toRowLabel,
				toPositionNo, rowsAway, positionsAway, freeExitUntil, false, bookingLink);
	}
}
