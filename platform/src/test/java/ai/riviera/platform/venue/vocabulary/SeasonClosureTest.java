package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The season-closure value mirrors {@code venue_season_closure_check} (V51): an open venue carries
 * no reopen date and no opt-in, and the opt-in needs a reopen date — so an off-shape value is
 * unrepresentable past the constructor.
 */
class SeasonClosureTest {

	private static final LocalDate REOPEN = LocalDate.of(2027, 5, 15);

	@Test
	void openCarriesNothing() {
		SeasonClosure open = SeasonClosure.open();
		assertFalse(open.closed());
		assertNull(open.reopenOn());
		assertFalse(open.advanceSales());
	}

	@Test
	void closedKeepsWhatItWasGiven() {
		SeasonClosure closed = SeasonClosure.closed(REOPEN, true);
		assertTrue(closed.closed());
		assertEquals(REOPEN, closed.reopenOn());
		assertTrue(closed.advanceSales());
		assertEquals(SeasonClosure.closed(null, false), new SeasonClosure(true, null, false));
	}

	@Test
	void anOpenVenueCannotCarryAReopenDateOrTheOptIn() {
		assertThrows(IllegalArgumentException.class, () -> new SeasonClosure(false, REOPEN, false));
		assertThrows(IllegalArgumentException.class, () -> new SeasonClosure(false, null, true));
	}

	@Test
	void theOptInNeedsAReopenDate() {
		assertThrows(IllegalArgumentException.class, () -> SeasonClosure.closed(null, true));
	}
}
