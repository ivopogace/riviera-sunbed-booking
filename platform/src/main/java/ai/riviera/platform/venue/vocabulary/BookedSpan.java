package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;

/**
 * The days a set's live bookings hold, as civil days in {@code Europe/Tirane} (invariant #6): the
 * earliest first day a guest may still turn up on to the latest last day any of them holds. Unlike
 * {@link StaySpan} it may run a whole season and has no width ceiling; a last day before the first is
 * unrepresentable.
 */
public record BookedSpan(LocalDate firstDay, LocalDate lastDay) {

	public BookedSpan {
		if (lastDay.isBefore(firstDay)) {
			throw new IllegalArgumentException("lastDay " + lastDay + " is before " + firstDay);
		}
	}

	/** A single day. */
	public static BookedSpan oneDay(LocalDate day) {
		return new BookedSpan(day, day);
	}
}
