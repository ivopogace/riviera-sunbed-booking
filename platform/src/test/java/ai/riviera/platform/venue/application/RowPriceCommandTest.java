package ai.riviera.platform.venue.application;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The validated intent to reprice one beach-map row. Mirrors the edge-validation
 * discipline of {@link SetCommand}: money is EUR minor units of at least €0.50 (invariant #5), and the row
 * label is required — a malformed reprice is rejected at the application boundary
 * (→ {@code 400 INVALID_REQUEST} via {@code ApiErrorHandler}, §6b), never reaching persistence.
 */
class RowPriceCommandTest {

	@Test
	void acceptsAValidRowPrice() {
		RowPriceCommand command = new RowPriceCommand("A", 4200, "EUR");

		assertEquals("A", command.rowLabel());
		assertEquals(4200, command.priceMinor());
		assertEquals("EUR", command.priceCurrency());
	}

	@Test
	void acceptsTheMinimumEurPrice() {
		assertEquals(50, new RowPriceCommand("B", 50, "EUR").priceMinor());
	}

	@Test
	void rejectsAPriceBelowTheMinimum() {
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("B", 49, "EUR"));
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("B", 0, "EUR"));
	}

	@Test
	void rejectsNegativePrice() {
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("A", -1, "EUR"));
	}

	@Test
	void rejectsBlankRowLabel() {
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("  ", 4200, "EUR"));
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand(null, 4200, "EUR"));
	}

	@Test
	void rejectsAnyCurrencyButEur() {
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("A", 4200, "ALL"));
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("A", 4200, "ABC"));
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("A", 4200, null));
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("A", 4200, ""));
	}
}
