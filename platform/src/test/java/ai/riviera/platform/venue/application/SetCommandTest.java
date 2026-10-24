package ai.riviera.platform.venue.application;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.Pool;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pins {@link SetCommand}'s edge bounds: the row label is the grid row's letter and nothing else, a
 * row past {@code Z} is refused, the price is EUR minor units of at least €0.50
 * ({@link ai.riviera.platform.venue.vocabulary.SetPrice}, invariant #5), and the pool is
 * presence-only. A violation is rejected at the application boundary (→ {@code 400 INVALID_REQUEST}, §6b).
 */
class SetCommandTest {

	private static SetCommand onRow(int gridY) {
		return new SetCommand(1, "PREMIUM", Pool.ONLINE, 4500, "EUR", 1, gridY);
	}

	@Test
	void theRowLabelIsTheGridRowsLetter() {
		assertEquals("A", onRow(1).rowLabel());
		assertEquals("C", onRow(3).rowLabel());
		assertEquals("Z", onRow(26).rowLabel());
		assertEquals("C", onRow(3).placement().rowLabel());
	}

	@Test
	void rejectsARowPastTheAlphabet() {
		assertThrows(IllegalArgumentException.class, () -> onRow(27));
		assertThrows(IllegalArgumentException.class, () -> onRow(0));
	}

	@Test
	void carriesTheTypedPool() {
		assertEquals(Pool.WALK_IN,
				new SetCommand(1, "PREMIUM", Pool.WALK_IN, 4500, "EUR", 1, 1).pool());
	}

	@Test
	void rejectsAMissingPool() {
		assertThrows(IllegalArgumentException.class,
				() -> new SetCommand(1, "PREMIUM", null, 4500, "EUR", 1, 1));
	}

	@Test
	void acceptsTheMinimumEurPrice() {
		assertEquals(50, new SetCommand(1, "PREMIUM", Pool.ONLINE, 50, "EUR", 1, 1).priceMinor());
	}

	@Test
	void rejectsAPriceBelowTheMinimum() {
		assertThrows(IllegalArgumentException.class,
				() -> new SetCommand(1, "PREMIUM", Pool.ONLINE, 49, "EUR", 1, 1));
		assertThrows(IllegalArgumentException.class,
				() -> new SetCommand(1, "PREMIUM", Pool.ONLINE, 0, "EUR", 1, 1));
	}

	@Test
	void rejectsANonEurCurrency() {
		assertThrows(IllegalArgumentException.class,
				() -> new SetCommand(1, "PREMIUM", Pool.ONLINE, 4500, "ALL", 1, 1));
	}

	@Test
	void rejectsANegativePrice() {
		assertThrows(IllegalArgumentException.class,
				() -> new SetCommand(1, "PREMIUM", Pool.ONLINE, -1, "EUR", 1, 1));
	}
}
