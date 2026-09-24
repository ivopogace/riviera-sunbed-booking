package ai.riviera.platform.booking.domain;

import java.time.LocalDate;
import java.util.List;

/**
 * The service days of a booking's span, first to last inclusive — every {@code (set, date)} row
 * the booking holds, so a release that walks this list frees the whole stay (invariant #2). The
 * Java twin of {@code booking_span_check} (V61): a last day before the first is refused here as
 * there.
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
}
