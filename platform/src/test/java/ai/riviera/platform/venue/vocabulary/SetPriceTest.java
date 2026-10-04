package ai.riviera.platform.venue.vocabulary;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** A set price is EUR minor units of at least €0.50; the message names the field, never the rejected value. */
class SetPriceTest {

	@Test
	void acceptsStripesMinimumEurCharge() {
		assertEquals(50, SetPrice.MIN_PRICE_MINOR);
		assertDoesNotThrow(() -> SetPrice.require(50, "EUR"));
	}

	@Test
	void refusesAnAmountBelowTheMinimum() {
		assertEquals("priceMinor must be at least 50",
				assertThrows(IllegalArgumentException.class, () -> SetPrice.require(49, "EUR")).getMessage());
		assertThrows(IllegalArgumentException.class, () -> SetPrice.require(0, "EUR"));
		assertThrows(IllegalArgumentException.class, () -> SetPrice.require(-1, "EUR"));
	}

	@Test
	void refusesAnyCurrencyButEurWithoutEchoingIt() {
		IllegalArgumentException refused =
				assertThrows(IllegalArgumentException.class, () -> SetPrice.require(4500, "ALL"));

		assertEquals("priceCurrency must be EUR", refused.getMessage());
		assertFalse(refused.getMessage().contains("ALL"));
		assertThrows(IllegalArgumentException.class, () -> SetPrice.require(4500, "eur"));
	}

	@Test
	void refusesAMissingCurrency() {
		assertEquals("priceCurrency is required",
				assertThrows(IllegalArgumentException.class, () -> SetPrice.require(4500, null)).getMessage());
		assertThrows(IllegalArgumentException.class, () -> SetPrice.require(4500, " "));
	}
}
