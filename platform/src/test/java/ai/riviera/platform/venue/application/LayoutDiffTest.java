package ai.riviera.platform.venue.application;

import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The coordinate-keyed diff behind the bulk beach-map save: a stored set whose grid cell the
 * submitted layout still names is updated in place under its own id, one whose cell is absent is
 * removed, and a cell no stored set occupies is inserted. The row label, position number, tier,
 * pool and price at a kept cell are whatever the submission says — none of them changes identity.
 */
class LayoutDiffTest {

	private static final SetId A1 = new SetId(11L);
	private static final SetId A2 = new SetId(12L);
	private static final SetId B1 = new SetId(21L);
	private static final SetId B2 = new SetId(22L);

	private static PlacedSet stored(SetId id, String row, int position, int x, int y) {
		return new PlacedSet(id, new SetPlacement(row, position, x, y));
	}

	private static SetCommand cell(String row, int position, int x, int y) {
		return new SetCommand(row, position, "STANDARD", Pool.ONLINE, 2000, "EUR", x, y);
	}

	private static SetCommand renamed(String row, int position, int x, int y) {
		return new SetCommand(row, position, "PREMIUM", Pool.WALK_IN, 9900, "EUR", x, y);
	}

	@Test
	void aKeptCellIsAnUpdateUnderTheStoredId() {
		List<PlacedSet> stored = List.of(stored(A1, "A", 1, 1, 1));
		SetCommand repainted = renamed("Front", 1, 1, 1);

		LayoutDiff diff = LayoutDiff.of(stored, new LayoutCommand(List.of(repainted)));

		assertEquals(List.of(new LayoutDiff.Update(stored.getFirst(), repainted)), diff.updates(),
				"same cell, new label, tier, pool and price: the set keeps its id");
		assertTrue(diff.disturbed().isEmpty(), "a rename in place disturbs nobody");
		assertTrue(diff.inserts().isEmpty());
		assertTrue(diff.removed().isEmpty());
	}

	@Test
	void aNewCellIsAnInsertAndAnAbsentCellARemoval() {
		List<PlacedSet> stored = List.of(stored(A1, "A", 1, 1, 1), stored(A2, "A", 2, 2, 1));
		SetCommand keptA1 = cell("A", 1, 1, 1);
		SetCommand newB1 = cell("B", 1, 1, 2);

		LayoutDiff diff = LayoutDiff.of(stored, new LayoutCommand(List.of(keptA1, newB1)));

		assertEquals(List.of(new LayoutDiff.Update(stored.getFirst(), keptA1)), diff.updates());
		assertEquals(List.of(newB1), diff.inserts());
		assertEquals(List.of(stored(A2, "A", 2, 2, 1)), diff.removed(),
				"the removed set rides with its placement, so a refusal can name it");
		assertEquals(diff.removed(), diff.disturbed());
	}

	@Test
	void aSmallerRegenerateRemovesExactlyTheOutOfBoundsSets() {
		List<PlacedSet> stored = List.of(stored(A1, "A", 1, 1, 1), stored(A2, "A", 2, 2, 1),
				stored(B1, "B", 1, 1, 2), stored(B2, "B", 2, 2, 2));

		LayoutDiff diff = LayoutDiff.of(stored, new LayoutCommand(List.of(cell("A", 1, 1, 1))));

		assertEquals(1, diff.updates().size());
		assertTrue(diff.inserts().isEmpty());
		assertEquals(List.of(A2, B1, B2), diff.removed().stream().map(PlacedSet::id).toList(),
				"removals keep the stored order, so the refusal lists sets as the map reads them");
	}

	@Test
	void anEmptyMapIsAllInserts() {
		LayoutDiff diff = LayoutDiff.of(List.of(), new LayoutCommand(List.of(cell("A", 1, 1, 1), cell("A", 2, 2, 1))));

		assertEquals(2, diff.inserts().size());
		assertTrue(diff.updates().isEmpty());
		assertTrue(diff.removed().isEmpty());
	}

	@Test
	void aPositionChangeAtAKeptCellIsADisturbanceARenameIsNot() {
		List<PlacedSet> stored = List.of(stored(A1, "A", 1, 1, 1), stored(A2, "A", 2, 2, 1));

		LayoutDiff diff = LayoutDiff.of(stored, new LayoutCommand(List.of(cell("Front", 1, 1, 1), cell("A", 7, 2, 1))));

		assertEquals(List.of(stored(A2, "A", 2, 2, 1)), diff.disturbed(),
				"a guest was told a row and a number: the number changing is a reposition, the label a rename");
		assertTrue(diff.collidingUpdates().isEmpty());
	}

	@Test
	void disturbedListsRemovedAndRepositionedSetsInStoredOrder() {
		List<PlacedSet> stored = List.of(stored(A1, "A", 1, 1, 1), stored(A2, "A", 2, 2, 1), stored(B1, "B", 1, 1, 2));

		LayoutDiff diff = LayoutDiff.of(stored, new LayoutCommand(List.of(cell("A", 1, 1, 1), cell("B", 9, 1, 2))));

		assertEquals(List.of(A2, B1), diff.disturbed().stream().map(PlacedSet::id).toList());
	}

	@Test
	void aRowNameSwapBetweenKeptCellsCollidesBothWays() {
		List<PlacedSet> stored = List.of(stored(A1, "A", 1, 1, 1), stored(B1, "B", 1, 1, 2));

		LayoutDiff diff = LayoutDiff.of(stored, new LayoutCommand(List.of(cell("B", 1, 1, 1), cell("A", 1, 1, 2))));

		assertEquals(List.of(A1, B1), diff.collidingUpdates(),
				"each set's new slot is the other's current one; written naively, the first UPDATE would collide");
		assertTrue(diff.disturbed().isEmpty(), "a swap of names moves no guest");
	}

	@Test
	void aRenameIntoASlotARemovedSetHeldDoesNotCollide() {
		List<PlacedSet> stored = List.of(stored(A1, "A", 1, 1, 1), stored(B1, "B", 1, 1, 2));

		LayoutDiff diff = LayoutDiff.of(stored, new LayoutCommand(List.of(cell("B", 1, 1, 1))));

		assertEquals(List.of(B1), diff.removed().stream().map(PlacedSet::id).toList());
		assertTrue(diff.collidingUpdates().isEmpty(), "the removal runs first and frees the slot");
	}
}
