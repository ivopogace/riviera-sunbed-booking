package ai.riviera.platform.payout.adapter.in;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.payout.application.DailyTakingsView;
import ai.riviera.platform.payout.application.ViewDailyTakings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The takings endpoint's date handling (#171, AC-5): "today" is resolved in {@code Europe/Tirane}
 * (invariant #6), not the JVM/UTC default, and an explicit {@code date} passes through. The
 * ownership/403 path is pinned end-to-end by {@code CrossVenueDenialIT}.
 */
class VenueTakingsControllerTest {

	// 2026-07-07T22:30Z is 2026-07-08 00:30 in Europe/Tirane (UTC+2 in summer) — a different civil day.
	private static final Clock LATE_EVENING_UTC =
			Clock.fixed(Instant.parse("2026-07-07T22:30:00Z"), ZoneOffset.UTC);

	private final CurrentOperator currentOperator = mock(CurrentOperator.class);

	@Test
	void defaultsToTodayInTiraneWhenNoDate() {
		when(currentOperator.require(any())).thenReturn(new OperatorId(7));
		LocalDate[] captured = new LocalDate[1];
		ViewDailyTakings capturing = (operator, venue, date) -> {
			captured[0] = date;
			return new DailyTakingsView(0, 0, 0, 0, "EUR", date);
		};
		VenueTakingsController controller =
				new VenueTakingsController(capturing, currentOperator, LATE_EVENING_UTC);

		controller.takings(mock(Authentication.class), 1L, null);

		assertEquals(LocalDate.of(2026, 7, 8), captured[0], "today is computed in Europe/Tirane, not UTC");
	}

	@Test
	void passesAnExplicitDateThroughAndMapsMoney() {
		when(currentOperator.require(any())).thenReturn(new OperatorId(7));
		LocalDate[] captured = new LocalDate[1];
		ViewDailyTakings capturing = (operator, venue, date) -> {
			captured[0] = date;
			return new DailyTakingsView(5000, 750, 4250, 1500, "EUR", date);
		};
		VenueTakingsController controller =
				new VenueTakingsController(capturing, currentOperator, LATE_EVENING_UTC);

		LocalDate explicit = LocalDate.of(2026, 6, 1);
		TakingsResponse response = controller.takings(mock(Authentication.class), 1L, explicit);

		assertEquals(explicit, captured[0]);
		assertEquals(5000, response.gross().minorUnits());
		assertEquals("EUR", response.gross().currency());
		assertEquals(4250, response.net().minorUnits());
		assertEquals(1500, response.commissionBps());
		assertEquals(explicit, response.date());
	}
}
