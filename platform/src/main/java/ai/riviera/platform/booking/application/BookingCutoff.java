package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.springframework.stereotype.Component;

/**
 * Enforces the no-same-day booking rule (invariant #4): bookings for a date close at the
 * venue's cutoff time the <strong>evening before</strong>. This single rule also serves as
 * collision-prevention Layer 2 and (later, U6) the cancellation cutoff.
 *
 * <p>The civil day is reasoned in {@code Europe/Tirane} (invariant #6) from an injected UTC
 * {@link Clock} — never the JVM default zone, never {@code LocalDateTime.now()}. A date is
 * bookable iff "now" is strictly before {@code (bookingDate − 1 day)} at the cutoff time in
 * that zone; past and same-day dates fail naturally.
 */
@Component
class BookingCutoff {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Clock clock;

	BookingCutoff(Clock clock) {
		this.clock = clock;
	}

	boolean isBookable(LocalTime cutoff, LocalDate bookingDate) {
		ZonedDateTime closesAt = bookingDate.minusDays(1).atTime(cutoff).atZone(TIRANE);
		return clock.instant().isBefore(closesAt.toInstant());
	}
}
