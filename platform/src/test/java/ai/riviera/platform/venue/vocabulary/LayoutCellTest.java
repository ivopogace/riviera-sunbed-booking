package ai.riviera.platform.venue.vocabulary;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** A cell obeys the save's own rules on construction, so the edge refuses a malformed one as 400. */
class LayoutCellTest {

	@Test
	void aWellFormedCellStripsItsLabel() {
		assertEquals("A", new LayoutCell(" A ", 1, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 1).rowLabel());
	}

	@Test
	void everyMalformedFieldIsRefused() {
		assertThrows(IllegalArgumentException.class, () -> new LayoutCell(" ", 1, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 1));
		assertThrows(IllegalArgumentException.class, () -> new LayoutCell("A".repeat(41), 1, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 1));
		assertThrows(IllegalArgumentException.class, () -> new LayoutCell("A", 0, "STANDARD", Pool.ONLINE, 2000, "EUR", 1, 1));
		assertThrows(IllegalArgumentException.class, () -> new LayoutCell("A", 1, "GOLD", Pool.ONLINE, 2000, "EUR", 1, 1));
		assertThrows(IllegalArgumentException.class, () -> new LayoutCell("A", 1, "STANDARD", null, 2000, "EUR", 1, 1));
		assertThrows(IllegalArgumentException.class, () -> new LayoutCell("A", 1, "STANDARD", Pool.ONLINE, -1, "EUR", 1, 1));
		assertThrows(IllegalArgumentException.class, () -> new LayoutCell("A", 1, "STANDARD", Pool.ONLINE, 2000, "EURO", 1, 1));
		assertThrows(IllegalArgumentException.class, () -> new LayoutCell("A", 1, "STANDARD", Pool.ONLINE, 2000, "EUR", 0, 1));
	}
}
