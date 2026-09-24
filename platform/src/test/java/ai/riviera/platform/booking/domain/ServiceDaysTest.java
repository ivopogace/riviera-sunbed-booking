package ai.riviera.platform.booking.domain;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** The span as a day list: inclusive at both ends, one day when they coincide, refused when reversed. */
class ServiceDaysTest {

	private static final LocalDate FIRST = LocalDate.of(2026, 7, 10);

	@Test
	void aOneDayBookingIsItsOneDay() {
		assertEquals(List.of(FIRST), ServiceDays.between(FIRST, FIRST));
	}

	@Test
	void aStayListsEveryDayFirstToLastInclusive() {
		assertEquals(List.of(FIRST, FIRST.plusDays(1), FIRST.plusDays(2)),
				ServiceDays.between(FIRST, FIRST.plusDays(2)));
	}

	@Test
	void aLastDayBeforeTheFirstIsRefused() {
		assertThrows(IllegalArgumentException.class, () -> ServiceDays.between(FIRST, FIRST.minusDays(1)),
				"the twin of booking_span_check");
	}
}
