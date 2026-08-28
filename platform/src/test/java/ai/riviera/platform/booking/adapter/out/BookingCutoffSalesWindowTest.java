package ai.riviera.platform.booking.adapter.out;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.BookingCutoff;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the {@code venue.spi.SalesWindow} implementor delegates to {@link BookingCutoff} —
 * one sales-window rule with one home (invariant #4), including the strictly-before boundary
 * the reserve path enforces. Pure unit test; the adapter ignores the injected clock and fences
 * on the caller-supplied instant.
 */
class BookingCutoffSalesWindowTest {

	private static final LocalDate DATE = LocalDate.of(2026, 8, 30);
	private static final LocalTime FOUR_PM = LocalTime.of(16, 0);
	// 2026-08-30 is CEST: Europe/Tirane = UTC+02:00, so 16:00 local = 14:00Z.
	private static final Instant BEFORE_CLOSE = Instant.parse("2026-08-30T13:59:00Z");
	private static final Instant AT_CLOSE = Instant.parse("2026-08-30T14:00:00Z");

	private final BookingCutoffSalesWindow window =
			new BookingCutoffSalesWindow(new BookingCutoff(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC)));

	@Test
	void delegatesToTheCutoffAuthority() {
		assertTrue(window.isOpen(FOUR_PM, DATE, BEFORE_CLOSE));
		assertFalse(window.isOpen(FOUR_PM, DATE, AT_CLOSE));
		assertTrue(window.isOpen(FOUR_PM, DATE.plusDays(1), AT_CLOSE));
	}

	@Test
	void closedAtTheExactCloseInstant() {
		assertFalse(window.isOpen(FOUR_PM, DATE, AT_CLOSE));
	}
}
