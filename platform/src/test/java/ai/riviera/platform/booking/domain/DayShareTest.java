package ai.riviera.platform.booking.domain;

import java.time.LocalDate;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * A booking's amount split over the days it serves: an even split lands the same on every day, an
 * odd one keeps the remainder on the first day, and every split sums back to the amount (invariant
 * #5 — integer minor units, none lost or invented). Pure unit test — no Spring, no DB.
 */
class DayShareTest {

	private static final LocalDate FIRST = LocalDate.of(2027, 8, 10);

	@Test
	void aOneDayBookingIsWorthItsWholeAmountOnItsDay() {
		assertEquals(4500L, DayShare.on(4500L, FIRST, FIRST, FIRST));
	}

	@Test
	void anEvenSplitLandsTheSameOnEveryDay() {
		LocalDate last = FIRST.plusDays(2);
		assertEquals(3000L, DayShare.on(9000L, FIRST, last, FIRST));
		assertEquals(3000L, DayShare.on(9000L, FIRST, last, FIRST.plusDays(1)));
		assertEquals(3000L, DayShare.on(9000L, FIRST, last, last));
	}

	@Test
	void theRemainderStaysOnTheFirstDay() {
		LocalDate last = FIRST.plusDays(2);
		assertEquals(3334L, DayShare.on(10000L, FIRST, last, FIRST));
		assertEquals(3333L, DayShare.on(10000L, FIRST, last, FIRST.plusDays(1)));
		assertEquals(3333L, DayShare.on(10000L, FIRST, last, last));
	}

	@Test
	void everySplitSumsBackToTheAmount() {
		LocalDate last = FIRST.plusDays(6);
		for (long amount : new long[] { 0L, 1L, 6L, 7L, 13L, 4499L }) {
			long sum = LongStream.range(0, 7)
					.map(i -> DayShare.on(amount, FIRST, last, FIRST.plusDays(i)))
					.sum();
			assertEquals(amount, sum, () -> "the seven shares of " + amount + " sum back to it");
		}
	}

	@Test
	void aDayOutsideTheSpanIsRefused() {
		assertThrows(IllegalArgumentException.class,
				() -> DayShare.on(9000L, FIRST, FIRST.plusDays(2), FIRST.plusDays(3)));
		assertThrows(IllegalArgumentException.class,
				() -> DayShare.on(9000L, FIRST, FIRST.plusDays(2), FIRST.minusDays(1)));
	}
}
