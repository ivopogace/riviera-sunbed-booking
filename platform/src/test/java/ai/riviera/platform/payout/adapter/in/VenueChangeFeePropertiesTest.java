package ai.riviera.platform.payout.adapter.in;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payout.application.VenueChangeFeeAmount;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The venue-change fee's configuration bounds. Validated in the compact constructor rather than with
 * {@code @Validated} — no JSR-303 implementation is on the classpath — so these are the guard.
 */
class VenueChangeFeePropertiesTest {

	@Test
	void anUnsetPropertyTakesTheCodeDefault() {
		assertEquals(500L, new VenueChangeFeeProperties(null).venueChangeFeeMinor(),
				"5 EUR, in integer minor units (invariant #5)");
	}

	@Test
	void aNegativeFeeIsRefused() {
		assertThrows(IllegalArgumentException.class, () -> new VenueChangeFeeProperties(-1L),
				"a negative fee would pay the venue for changing a guest's deal");
	}

	@Test
	void aZeroFeeIsAllowed() {
		assertEquals(0L, new VenueChangeFeeProperties(0L).venueChangeFeeMinor(),
				"charging nothing is a deliberate setting, not a misconfiguration");
	}

	@Test
	void theApplicationValueCarriesTheAmountAndItsCurrency() {
		VenueChangeFeeAmount fee = new VenueChangeFeeAmount(500L, "EUR");

		assertEquals(500L, fee.minorUnits());
		assertEquals("EUR", fee.currency());
	}

	@Test
	void theApplicationValueRefusesANegativeAmountOrABlankCurrency() {
		assertThrows(IllegalArgumentException.class, () -> new VenueChangeFeeAmount(-1L, "EUR"));
		assertThrows(IllegalArgumentException.class, () -> new VenueChangeFeeAmount(500L, " "));
	}
}
