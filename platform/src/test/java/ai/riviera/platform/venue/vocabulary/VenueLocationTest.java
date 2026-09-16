package ai.riviera.platform.venue.vocabulary;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The venue-location value mirrors {@code venue_location_check} (V58): a location carries both
 * coordinates or it does not exist, and each stays within its range — so a half-present or
 * off-planet pin is unrepresentable past the constructor. Absence is a null location, never a
 * half-filled value.
 */
class VenueLocationTest {

	private static final BigDecimal DHERMI_LAT = new BigDecimal("40.146800");
	private static final BigDecimal DHERMI_LON = new BigDecimal("19.648200");

	@Test
	void aWholePairInRangeIsKept() {
		VenueLocation pin = new VenueLocation(DHERMI_LAT, DHERMI_LON);
		assertEquals(DHERMI_LAT, pin.latitude());
		assertEquals(DHERMI_LON, pin.longitude());
	}

	@Test
	void eitherCoordinateAloneIsRefused() {
		assertThrows(IllegalArgumentException.class, () -> new VenueLocation(DHERMI_LAT, null));
		assertThrows(IllegalArgumentException.class, () -> new VenueLocation(null, DHERMI_LON));
		assertThrows(IllegalArgumentException.class, () -> new VenueLocation(null, null));
	}

	@Test
	void aCoordinateOutOfRangeIsRefused() {
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(new BigDecimal("90.000001"), DHERMI_LON));
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(new BigDecimal("-90.000001"), DHERMI_LON));
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(DHERMI_LAT, new BigDecimal("180.000001")));
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(DHERMI_LAT, new BigDecimal("-180.000001")));
	}

	@Test
	void theBoundsThemselvesAreInRange() {
		assertEquals(0, new VenueLocation(new BigDecimal("-90"), new BigDecimal("-180"))
				.latitude().compareTo(new BigDecimal("-90")));
		assertEquals(0, new VenueLocation(new BigDecimal("90"), new BigDecimal("180"))
				.longitude().compareTo(new BigDecimal("180")));
	}

	/** Scale 6 is what the columns store, so a saved pin equals the one a later read returns. */
	@Test
	void bothCoordinatesAreNormalisedToSixDecimals() {
		VenueLocation pin = new VenueLocation(new BigDecimal("40.14681234"), new BigDecimal("19.6482"));
		assertEquals("40.146812", pin.latitude().toPlainString());
		assertEquals("19.648200", pin.longitude().toPlainString());
		assertEquals(new VenueLocation(new BigDecimal("40.146812"), new BigDecimal("19.648200")), pin);
	}
}
