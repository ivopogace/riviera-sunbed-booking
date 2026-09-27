package ai.riviera.platform.booking.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.Optional;

/**
 * When a stitched stay's move is reminded: the evening before, from {@code sendFrom} wall-clock time
 * until that day ends, naming tomorrow. Before the hour nothing is due; a move day that is already
 * today is never announced late, so "tomorrow" in the mail stays true. Pure (ADR-0018 §2): the caller
 * hands in the reading in {@code Europe/Tirane} (invariant #6). Rationale: RESPONSIBILITIES.md §booking.
 */
public final class MoveReminderWindow {

	private MoveReminderWindow() {
	}

	/** The move day due for a reminder at {@code now}, or empty before the evening's send hour. */
	public static Optional<LocalDate> dueMoveDay(ZonedDateTime now, LocalTime sendFrom) {
		if (now.toLocalTime().isBefore(sendFrom)) {
			return Optional.empty();
		}
		return Optional.of(now.toLocalDate().plusDays(1));
	}
}
