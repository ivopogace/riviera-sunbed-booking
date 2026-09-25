package ai.riviera.platform.venue.application;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.Beach;
import ai.riviera.platform.venue.vocabulary.VenueLocation;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Validation of the widened venue-profile command. The command now carries the
 * editable core fields (name/beach/description/bookingMode/bookingCutoff/salesClose)
 * alongside the T7 amenities + distance; commission and payout currency are read-only and
 * deliberately absent (a crafted write can never set them). The compact constructor enforces the
 * same edge invariants as {@link NewVenueCommand} (shared via {@code VenueFieldValidation});
 * {@code salesClose} is required — the off-vocabulary cases live in {@code SalesCloseTest},
 * where the type makes them unrepresentable. The DB CHECKs are the backstop.
 */
class VenueProfileCommandTest {

	private static final VenueLocation DHERMI =
			new VenueLocation(new BigDecimal("40.146800"), new BigDecimal("19.648200"));

	private static VenueProfileCommand valid() {
		return new VenueProfileCommand("Sunset", Beach.KSAMIL, "nice", "INSTANT",
				LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, Set.of(Amenity.WIFI), 20, DHERMI, null);
	}

	@Test
	void holdsAllEditableFields() {
		VenueProfileCommand c = valid();
		assertEquals("Sunset", c.name());
		assertEquals(Beach.KSAMIL, c.beach());
		assertEquals("nice", c.description());
		assertEquals("INSTANT", c.bookingMode());
		assertEquals(LocalTime.of(18, 0), c.bookingCutoff());
		assertEquals(SalesClose.MID_AFTERNOON, c.salesClose());
		assertEquals(Set.of(Amenity.WIFI), c.amenities());
		assertEquals(20, c.distanceToWaterM());
		assertEquals(DHERMI, c.location());
	}

	@Test
	void aNullLocationIsAllowedAndMeansNoPin() {
		assertDoesNotThrow(() -> new VenueProfileCommand("Sunset", Beach.KSAMIL, "nice",
				"INSTANT", LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, Set.of(), 20, null, null));
	}

	@Test
	void anOffShapeLocationIsRejectedByItsOwnType() {
		// The bounds live on VenueLocation, so the command inherits them rather than restating them.
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(new BigDecimal("40.146800"), null));
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(new BigDecimal("90.000001"), new BigDecimal("19.648200")));
	}

	@Test
	void blankNameIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("  ", Beach.KSAMIL,
				 "nice", "INSTANT", LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, Set.of(), null, null, null));
	}

	@Test
	void nullBeachIsRejected() {
		// AC-1: the catalogue type makes an off-catalogue beach unrepresentable; absence is the one edge case left.
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", null,
				"nice", "INSTANT", LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, Set.of(), null, null, null));
	}

	@Test
	void unknownBookingModeIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", Beach.KSAMIL,
				 "nice", "MAYBE", LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, Set.of(), null, null, null));
	}

	@Test
	void nullCutoffIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", Beach.KSAMIL,
				 "nice", "INSTANT", null, SalesClose.MID_AFTERNOON, Set.of(), null, null, null));
	}

	@Test
	void nullSalesCloseIsRejected() {
		// AC-2 (#794): the full-replace edit must always state the choice — null never means "keep".
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", Beach.KSAMIL,
				 "nice", "INSTANT", LocalTime.of(18, 0), null, Set.of(), null, null, null));
	}

	@Test
	void nonPositiveDistanceIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", Beach.KSAMIL,
				 "nice", "INSTANT", LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, Set.of(), 0, null, null));
	}

	@Test
	void nonPositiveMaxStayIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new VenueProfileCommand("Sunset", Beach.KSAMIL,
				 "nice", "INSTANT", LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, Set.of(), null, null, 0));
	}

	@Test
	void aMaximumOfOneDayIsAllowed() {
		assertDoesNotThrow(() -> new VenueProfileCommand("Sunset", Beach.KSAMIL, null,
				"INSTANT", LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, Set.of(), null, null, 1));
	}

	@Test
	void nullDescriptionAndNullDistanceAreAllowed() {
		assertDoesNotThrow(() -> new VenueProfileCommand("Sunset", Beach.KSAMIL, null,
				"REQUEST", LocalTime.of(17, 30), SalesClose.DAY_END, Set.of(), null, null, null));
	}

	@Test
	void amenitiesAreDefensivelyCopiedAndOrderInsensitive() {
		Set<Amenity> source = new HashSet<>(Set.of(Amenity.WIFI, Amenity.CAFE));
		VenueProfileCommand c = new VenueProfileCommand("N", Beach.DHERMI, null, "INSTANT",
				LocalTime.of(18, 0), SalesClose.MID_AFTERNOON, source, null, null, null);
		source.clear(); // must not affect the command's copy
		assertEquals(Set.of(Amenity.WIFI, Amenity.CAFE), c.amenities());
	}
}
