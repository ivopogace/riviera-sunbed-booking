package ai.riviera.platform.booking.vocabulary;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The published fee value the remodel preview quotes: a positive magnitude with its currency, and the
 * one piece of arithmetic it owns — what a picture's refunds cost in total (invariant #5).
 */
class VenueChangeFeeTest {

	private static final VenueChangeFee FEE = new VenueChangeFee(500L, "EUR");

	@Test
	void totalsByRefundCount() {
		assertEquals(0L, FEE.totalFor(0), "a picture that refunds nobody costs nothing");
		assertEquals(500L, FEE.totalFor(1));
		assertEquals(1500L, FEE.totalFor(3));
	}

	@Test
	void refusesANegativeAmountOrABlankCurrency() {
		assertThrows(IllegalArgumentException.class, () -> new VenueChangeFee(-1L, "EUR"),
				"a fee deducts because its ledger entry type is FEE, never because its amount is signed");
		assertThrows(IllegalArgumentException.class, () -> new VenueChangeFee(500L, ""));
	}
}
