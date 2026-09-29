package ai.riviera.platform.booking.domain;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * The service days of a booking's span, first to last inclusive — every {@code (set, date)} row the
 * booking holds, so a release that walks this list frees the whole stay (invariant #2); {@link #held}
 * leaves out the days the venue released (ADR-0027), whose row is another guest's or nobody's. The Java
 * twin of {@code booking_span_check} (V61): a last day before the first is refused here as there.
 */
public final class ServiceDays {

	private ServiceDays() {
	}

	public static List<LocalDate> between(LocalDate firstDay, LocalDate lastDay) {
		if (lastDay.isBefore(firstDay)) {
			throw new IllegalArgumentException("a span's last day " + lastDay + " is before its first " + firstDay);
		}
		return firstDay.datesUntil(lastDay.plusDays(1)).toList();
	}

	/** The span's days whose claim the booking still holds: {@link #between} less {@code released}. */
	public static List<LocalDate> held(LocalDate firstDay, LocalDate lastDay, Collection<LocalDate> released) {
		Set<LocalDate> gone = Set.copyOf(released);
		return between(firstDay, lastDay).stream().filter(day -> !gone.contains(day)).toList();
	}
}
