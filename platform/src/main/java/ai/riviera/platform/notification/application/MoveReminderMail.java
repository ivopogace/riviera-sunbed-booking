package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

/**
 * What the evening-before move reminder renders (design D13): the stay's code (a bearer credential,
 * invariant #7: mailed, never logged), the venue, tomorrow's date and the stay's last day
 * ({@code Europe/Tirane}, #6), today's spot (named only while {@code fromDayHeld}: a refunded day is not
 * today's spot, #1381), tomorrow's spot with the distance, and the code-gated link. Public for its adapters.
 * Rationale: RESPONSIBILITIES.md §notification.
 */
public record MoveReminderMail(String bookingCode, String venueName, LocalDate moveDate, LocalDate stayLastDate,
		String fromRowLabel, int fromPositionNo, String toRowLabel, int toPositionNo, int rowsAway,
		int positionsAway, URI bookingLink, boolean fromDayHeld) {
}
