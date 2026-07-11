package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.Amenity;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Validation of the widened venue-profile command (O8, issue #177). The command now carries the
 * editable core fields (name/beach/region/description/bookingMode/bookingCutoff) alongside the
 * T7 amenities + distance; commission and payout currency are read-only and deliberately absent
 * (a crafted write can never set them). The compact constructor enforces the same edge invariants
 * as {@link NewVenueCommand} (shared via {@code VenueFieldValidation}); the DB CHECKs are the backstop.
 */
class VenueProfileCommandTest {

	private static VenueProfileCommand valid() {
		return new VenueProfileCommand("Sunset", "Ksamil", "Riviera", "nice", "INSTANT",
				LocalTime.of(18, 0), Set.of(Amenity.WIFI), 20);
	}

	@Test
	void holdsAllEditableFields() {
		VenueProfileCommand c = valid();
		assertEquals("Sunset", c.name());
		assertEquals("Ksamil", c.beach());
		assertEquals("Riviera", c.region());
		assertEquals("nice", c.description());
		assertEquals("INSTANT", c.bookingMode());
		assertEquals(LocalTime.of(18, 0), c.bookingCutoff());
		assertEquals(Set.of(Amenity.WIFI), c.amenities());
		assertEquals(20, c.distanceToWaterM());
	}

	@Test
	void blankNameIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("  ", "Ksamil",
				"Riviera", "nice", "INSTANT", LocalTime.of(18, 0), Set.of(), null));
	}

	@Test
	void blankBeachOrRegionIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", "",
				"Riviera", "nice", "INSTANT", LocalTime.of(18, 0), Set.of(), null));
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", "Ksamil",
				null, "nice", "INSTANT", LocalTime.of(18, 0), Set.of(), null));
	}

	@Test
	void unknownBookingModeIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", "Ksamil",
				"Riviera", "nice", "MAYBE", LocalTime.of(18, 0), Set.of(), null));
	}

	@Test
	void nullCutoffIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", "Ksamil",
				"Riviera", "nice", "INSTANT", null, Set.of(), null));
	}

	@Test
	void nonPositiveDistanceIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", "Ksamil",
				"Riviera", "nice", "INSTANT", LocalTime.of(18, 0), Set.of(), 0));
	}

	@Test
	void nullDescriptionAndNullDistanceAreAllowed() {
		assertDoesNotThrow(() -> new VenueProfileCommand("Sunset", "Ksamil", "Riviera", null,
				"REQUEST", LocalTime.of(17, 30), Set.of(), null));
	}

	@Test
	void amenitiesAreDefensivelyCopiedAndOrderInsensitive() {
		Set<Amenity> source = new HashSet<>(Set.of(Amenity.WIFI, Amenity.CAFE));
		VenueProfileCommand c = new VenueProfileCommand("N", "B", "R", null, "INSTANT",
				LocalTime.of(18, 0), source, null);
		source.clear(); // must not affect the command's copy
		assertEquals(Set.of(Amenity.WIFI, Amenity.CAFE), c.amenities());
	}
}
