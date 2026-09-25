package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * The days a tourist asks about or books, first to last inclusive, as civil days in
 * {@code Europe/Tirane} (invariant #6). One day is a span whose last day is its first. A last day
 * before the first, or a span longer than {@link #MAX_DAYS}, is unrepresentable.
 *
 * <p>{@link #MAX_DAYS} is a technical ceiling shared by the map read and the reserve — the widest
 * window one request may ask the availability table about — not a product maximum: a venue's own
 * stay cap is its setting, and the platform sets none (RESPONSIBILITIES.md §venue).
 */
public record StaySpan(LocalDate firstDay, LocalDate lastDay) {

	/** The widest span served, the same width as the availability calendar's window. */
	public static final int MAX_DAYS = 62;

	public StaySpan {
		if (lastDay.isBefore(firstDay)) {
			throw new IllegalArgumentException("lastDate " + lastDay + " is before " + firstDay);
		}
		if (ChronoUnit.DAYS.between(firstDay, lastDay) + 1 > MAX_DAYS) {
			throw new IllegalArgumentException("a stay may span at most " + MAX_DAYS + " days");
		}
	}

	/** A single day. */
	public static StaySpan oneDay(LocalDate day) {
		return new StaySpan(day, day);
	}

	/** A span from {@code firstDay} to {@code lastDay}, which defaults to {@code firstDay} when null. */
	public static StaySpan of(LocalDate firstDay, LocalDate lastDay) {
		return new StaySpan(firstDay, lastDay != null ? lastDay : firstDay);
	}

	/** How many days the span covers, at least one. */
	public int days() {
		return (int) ChronoUnit.DAYS.between(firstDay, lastDay) + 1;
	}

	public boolean isOneDay() {
		return firstDay.equals(lastDay);
	}

	/** Every day of the span, ascending. */
	public List<LocalDate> eachDay() {
		return firstDay.datesUntil(lastDay.plusDays(1)).toList();
	}
}
