package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The free-exit deadline of a moved booking: {@code min(serviceDayOpensAt, max(12:00 Europe/Tirane
 * the day before, movedAt + 24h))}. Three arms, one case each, plus the DST edge — the arithmetic is
 * in Tirane wall-clock, never in the JVM zone (invariant #6).
 */
class BookingCutoffFreeExitTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private final BookingCutoff cutoff = new BookingCutoff(Clock.systemUTC());

	private static Instant tirane(int year, int month, int day, int hour, int minute) {
		return ZonedDateTime.of(year, month, day, hour, minute, 0, 0, TIRANE).toInstant();
	}

	@Test
	void aMoveAtThreeInTheAfternoonTwoDaysOutEndsTwentyFourHoursLaterNotAtNoonTheDayBefore() {
		Instant movedAt = tirane(2026, 9, 10, 15, 0);

		assertEquals(tirane(2026, 9, 11, 15, 0), cutoff.freeExitEndsAt(LocalDate.of(2026, 9, 12), movedAt));
	}

	@Test
	void aMoveFarOutEndsAtNoonTheDayBefore() {
		Instant movedAt = tirane(2026, 9, 10, 15, 0);

		assertEquals(tirane(2026, 9, 14, 12, 0), cutoff.freeExitEndsAt(LocalDate.of(2026, 9, 15), movedAt));
	}

	@Test
	void aMoveHoursBeforeTheDayOpensEndsWhenItOpens() {
		Instant movedAt = tirane(2026, 9, 11, 21, 0);

		assertEquals(tirane(2026, 9, 12, 0, 0), cutoff.freeExitEndsAt(LocalDate.of(2026, 9, 12), movedAt));
	}

	@Test
	void theDayBeforeIsReadInTiraneAcrossTheAutumnClockChange() {
		// 25 Oct 2026 is the DST fall-back: noon the day before is still noon Tirane wall-clock.
		Instant movedAt = tirane(2026, 10, 20, 9, 0);

		assertEquals(tirane(2026, 10, 25, 12, 0), cutoff.freeExitEndsAt(LocalDate.of(2026, 10, 26), movedAt));
	}
}
