package ai.riviera.platform.payout;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payout.domain.PeriodKey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The ISO-week period key (U9, issue #12): format validation and the ISO week of a calendar day.
 * Pure unit test.
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
}
