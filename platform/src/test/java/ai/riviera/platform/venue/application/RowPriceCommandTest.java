package ai.riviera.platform.venue.application;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The validated intent to reprice one beach-map row. Mirrors the edge-validation
 * discipline of {@link SetCommand}: money is integer minor units + an ISO-4217 currency (invariant
 * #5), and the row label is required — a malformed reprice is rejected at the application boundary
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
	void acceptsZeroPrice() {
		// Zero is a legitimate price (a free row); the CHECK constraint is price_minor >= 0.
		assertEquals(0, new RowPriceCommand("B", 0, "EUR").priceMinor());
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
	void rejectsNonIsoCurrency() {
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("A", 4200, "ABC"));
		assertThrows(IllegalArgumentException.class, () -> new RowPriceCommand("A", 4200, ""));
	}
}
