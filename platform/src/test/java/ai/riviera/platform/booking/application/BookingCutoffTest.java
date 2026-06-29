package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the evening-before cutoff arithmetic (issue #6, AC-5 / invariants #4, #6): a date
 * is bookable until its cutoff time the day before, computed in {@code Europe/Tirane} from a
 * fixed UTC clock — never the JVM default zone. Pure unit test (real {@link BookingCutoff} +
 * {@code Clock.fixed}).
 */
class BookingCutoffTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final LocalTime CUTOFF = LocalTime.of(18, 0);
	private static final LocalDate BOOKING_DATE = LocalDate.of(2026, 7, 15);

	private BookingCutoff at(ZonedDateTime tiraneNow) {
		return new BookingCutoff(Clock.fixed(tiraneNow.toInstant(), ZoneId.of("UTC")));
	}

	@Test
	void bookableJustBeforeCutoff() {
		// 17:59 Tirane on the evening before — one minute before close.
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 14, 17, 59, 0, 0, TIRANE));
		assertTrue(cutoff.isBookable(CUTOFF, BOOKING_DATE));
	}

	@Test
	void closedAtCutoff() {
		// Exactly 18:00 Tirane the evening before — closed (strictly-before rule).
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 14, 18, 0, 0, 0, TIRANE));
		assertFalse(cutoff.isBookable(CUTOFF, BOOKING_DATE));
	}

	@Test
	void closedForSameDay() {
		// Morning of the booking date — long past the evening-before cutoff.
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 15, 9, 0, 0, 0, TIRANE));
		assertFalse(cutoff.isBookable(CUTOFF, BOOKING_DATE));
	}

	@Test
	void closedForPastDate() {
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 20, 9, 0, 0, 0, TIRANE));
		assertFalse(cutoff.isBookable(CUTOFF, BOOKING_DATE));
	}

	@Test
	void freeCancellationOpenSharesTheEveningBeforeBoundary() {
		// U6 (invariant #4: one rule, two jobs) — free cancellation closes at the same instant
		// booking closes. Open at 17:59 the evening before; closed at 18:00 and on the day.
		assertTrue(at(ZonedDateTime.of(2026, 7, 14, 17, 59, 0, 0, TIRANE))
				.freeCancellationOpen(CUTOFF, BOOKING_DATE));
		assertFalse(at(ZonedDateTime.of(2026, 7, 14, 18, 0, 0, 0, TIRANE))
				.freeCancellationOpen(CUTOFF, BOOKING_DATE));
		assertFalse(at(ZonedDateTime.of(2026, 7, 15, 9, 0, 0, 0, TIRANE))
				.freeCancellationOpen(CUTOFF, BOOKING_DATE));
	}
}
