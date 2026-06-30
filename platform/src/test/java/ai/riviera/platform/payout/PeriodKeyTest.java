package ai.riviera.platform.payout;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payout.domain.PeriodKey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The ISO-week period key (U9, issue #12): format validation and that the week is computed in
 * {@code Europe/Tirane} (invariant #6), not UTC — the boundary case that would otherwise bucket an
 * entry into the wrong week. Pure unit test.
 */
class PeriodKeyTest {

	@Test
	void rejectsMalformedPeriods() {
		assertThrows(IllegalArgumentException.class, () -> PeriodKey.of("2026-W7"), "week must be 2 digits");
		assertThrows(IllegalArgumentException.class, () -> PeriodKey.of("2026W27"), "needs the -W- separator");
		assertThrows(IllegalArgumentException.class, () -> PeriodKey.of("nope"));
		assertThrows(IllegalArgumentException.class, () -> PeriodKey.of(null));
	}

	@Test
	void rejectsNonExistentIsoWeeks() {
		assertThrows(IllegalArgumentException.class, () -> PeriodKey.of("2026-W00"), "week 00 never exists");
		assertThrows(IllegalArgumentException.class, () -> PeriodKey.of("2026-W54"), "max ISO week is 53");
		assertThrows(IllegalArgumentException.class, () -> PeriodKey.of("2026-W99"));
	}

	@Test
	void formatsIsoWeek() {
		// 2026-06-29 is a Monday — the first day of ISO week 2026-W27.
		assertEquals("2026-W27", PeriodKey.ofDate(LocalDate.of(2026, 6, 29)).value());
		// 2026-06-28 is the Sunday before — the last day of the previous ISO week.
		assertEquals("2026-W26", PeriodKey.ofDate(LocalDate.of(2026, 6, 28)).value());
	}

	@Test
	void computesTheWeekInTiraneNotUtc() {
		// 2026-06-28T22:30Z is still Sunday in UTC (W26) but already Monday 00:30 in Europe/Tirane (+2),
		// which is the start of W27. The period must follow Tirane (invariant #6), not the UTC date.
		Clock atTiraneMonday = Clock.fixed(Instant.parse("2026-06-28T22:30:00Z"), ZoneId.of("UTC"));

		assertEquals("2026-W27", PeriodKey.current(atTiraneMonday).value(),
				"the week is the Tirane week (Monday), not the UTC week (Sunday)");
		assertNotEquals("2026-W26", PeriodKey.current(atTiraneMonday).value());
	}
}
