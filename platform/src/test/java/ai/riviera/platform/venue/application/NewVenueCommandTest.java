package ai.riviera.platform.venue.application;

import java.time.LocalTime;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.Beach;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Validation of the onboarding command's beach: it is a catalogue {@link Beach}, so the only edge
 * case the compact constructor still owns is absence (an off-catalogue code never reaches it — the
 * edge parser rejects it, pinned in {@code BeachCodeTest}). The rest of the command's edge
 * invariants are shared with {@link VenueProfileCommand} and pinned in its test.
 */
class NewVenueCommandTest {

	@Test
	void holdsTheCatalogueBeach() {
		NewVenueCommand c = new NewVenueCommand("Sunset", Beach.DHERMI, "nice", "INSTANT", "EUR",
				LocalTime.of(18, 0), null);
		assertEquals(Beach.DHERMI, c.beach());
		assertEquals(Beach.Region.HIMARE, c.beach().region());
		assertEquals(SalesClose.DEFAULT, c.salesClose());
	}

	@Test
	void nullBeachIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new NewVenueCommand("Sunset", null, "nice",
				"INSTANT", "EUR", LocalTime.of(18, 0), null));
	}
}
