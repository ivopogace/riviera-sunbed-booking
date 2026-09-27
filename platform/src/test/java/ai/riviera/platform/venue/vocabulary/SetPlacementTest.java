package ai.riviera.platform.venue.vocabulary;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The move distance every reader agrees on (the remodel move rule, the itinerary search, the move
 * reminder): rows apart by grid row, positions apart by position number, both absolute.
 */
class SetPlacementTest {

	private static final SetPlacement A3 = new SetPlacement("A", 3, 3, 1);

	@Test
	void theSameRowIsZeroRowsAway() {
		assertEquals(0, A3.rowsAway(new SetPlacement("A", 7, 7, 1)));
		assertEquals(4, A3.positionsAway(new SetPlacement("A", 7, 7, 1)));
	}

	@Test
	void distanceIsSymmetricAndAbsolute() {
		SetPlacement c1 = new SetPlacement("C", 1, 1, 3);
		assertEquals(2, A3.rowsAway(c1));
		assertEquals(2, c1.rowsAway(A3));
		assertEquals(2, A3.positionsAway(c1));
		assertEquals(2, c1.positionsAway(A3));
	}

	@Test
	void theGridColumnPlaysNoPart() {
		assertEquals(0, A3.positionsAway(new SetPlacement("B", 3, 9, 2)), "position number, not grid x");
	}
}
