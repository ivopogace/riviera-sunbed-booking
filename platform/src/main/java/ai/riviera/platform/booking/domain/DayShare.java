package ai.riviera.platform.booking.domain;

import java.time.LocalDate;

/**
 * A booking's amount on one of the days it serves: the amount split evenly over the span, the
 * remainder on the first day, so the days sum back to the amount in integer minor units (invariant
 * #5). One rule for every per-day reading of a stay's money (daily takings, design D4).
 */
public final class DayShare {

	private DayShare() {
	}

	/**
	 * The share of {@code amountMinor} on {@code day}, a day of the span {@code firstDay..lastDay}
	 * inclusive; a day outside the span is refused.
	 */
	public static long on(long amountMinor, LocalDate firstDay, LocalDate lastDay, LocalDate day) {
		int days = ServiceDays.between(firstDay, lastDay).size();
		if (day.isBefore(firstDay) || day.isAfter(lastDay)) {
			throw new IllegalArgumentException(day + " is outside " + firstDay + ".." + lastDay);
		}
		long share = amountMinor / days;
		return day.equals(firstDay) ? share + amountMinor % days : share;
	}
}
