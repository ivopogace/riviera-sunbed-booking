package ai.riviera.platform.venue.domain;

import java.time.LocalTime;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pins the {@link SalesClose} vocabulary: the three choices' wall-clock times mirror the
 * {@code venue_sales_close_check} tokens (V44 — the DB-side pin is {@code SalesCloseMigrationIT}),
 * the default is the 16:00 epic decision, and {@code fromTime} is the single conversion in —
 * anything off-vocabulary is unrepresentable past it (invariant #4's fixed three values).
 */
class SalesCloseTest {

	@Test
	void theThreeChoicesMirrorTheV44CheckTokens() {
		assertEquals(LocalTime.of(0, 1), SalesClose.DAY_START.time());
		assertEquals(LocalTime.of(16, 0), SalesClose.MID_AFTERNOON.time());
		assertEquals(LocalTime.of(23, 59), SalesClose.DAY_END.time());
		assertEquals(SalesClose.MID_AFTERNOON, SalesClose.DEFAULT);
	}

	@Test
	void fromTimeAcceptsExactlyTheThreeValues() {
		assertEquals(SalesClose.DAY_START, SalesClose.fromTime(LocalTime.of(0, 1)));
		assertEquals(SalesClose.MID_AFTERNOON, SalesClose.fromTime(LocalTime.of(16, 0)));
		assertEquals(SalesClose.DAY_END, SalesClose.fromTime(LocalTime.of(23, 59)));
	}

	@Test
	void fromTimeRejectsAnythingButTheThreeValues() {
		assertThrows(IllegalArgumentException.class, () -> SalesClose.fromTime(LocalTime.of(12, 0)));
		assertThrows(IllegalArgumentException.class, () -> SalesClose.fromTime(LocalTime.of(16, 0, 1)));
		assertThrows(IllegalArgumentException.class, () -> SalesClose.fromTime(null));
	}
}
