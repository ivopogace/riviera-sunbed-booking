package ai.riviera.platform.venue.application;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The bulk beach-map save as a diff of the submitted layout against the stored active map, keyed
 * by grid cell: a stored set whose cell the submission still names is an {@link Update} under its
 * own id (whatever the label, tier, pool or price now say), a submitted cell no stored set occupies
 * is an insert, and a stored set whose cell is absent is removed. The sets a guest can be disturbed
 * by are the removed ones and the kept ones whose position number changes — a guest was told a row
 * and a number — so those alone are probed for a live claim; a row label changes in place, as a
 * rename does. A set that changes cell reaches this diff as a removal plus an insert: the request
 * carries no ids, so the cell is the identity. Rationale: RESPONSIBILITIES.md §venue.
 */
record LayoutDiff(List<Update> updates, List<SetCommand> inserts, List<PlacedSet> removed) {

	/** A kept cell: the stored set and the fields the submission wants on it. */
	record Update(PlacedSet stored, SetCommand command) {

		/** Whether the submission changes the set's position number — the one in-place edit that disturbs a guest. */
		boolean repositions() {
			return stored.placement().positionNo() != command.positionNo();
		}
	}

	static LayoutDiff of(List<PlacedSet> stored, LayoutCommand command) {
		Map<String, PlacedSet> byCell = new HashMap<>();
		for (PlacedSet set : stored) {
			byCell.put(cellKey(set.placement().gridX(), set.placement().gridY()), set);
		}
		List<Update> updates = new ArrayList<>();
		List<SetCommand> inserts = new ArrayList<>();
		for (SetCommand cell : command.sets()) {
			PlacedSet kept = byCell.remove(cellKey(cell.gridX(), cell.gridY()));
			if (kept == null) {
				inserts.add(cell);
			}
			else {
				updates.add(new Update(kept, cell));
			}
		}
		List<PlacedSet> removed = stored.stream().filter(byCell::containsValue).toList();
		return new LayoutDiff(List.copyOf(updates), List.copyOf(inserts), removed);
	}

	/** The sets this save could strand a guest on — removed or repositioned — in stored order. */
	List<PlacedSet> disturbed() {
		List<PlacedSet> repositioned = updates.stream().filter(Update::repositions).map(Update::stored).toList();
		return Stream.concat(removed.stream(), repositioned.stream())
				.sorted((a, b) -> Long.compare(a.id().value(), b.id().value()))
				.toList();
	}

	/**
	 * The kept sets whose new row label and position another kept set currently holds — a swap or a
	 * rotation of row names. Their in-place updates would collide on the layout-uniqueness index
	 * before the other set moves on, so the save parks their labels first.
	 */
	List<SetId> collidingUpdates() {
		Map<String, SetId> occupied = new HashMap<>();
		for (Update update : updates) {
			SetPlacement at = update.stored().placement();
			occupied.put(slotKey(at.rowLabel(), at.positionNo()), update.stored().id());
		}
		List<SetId> colliding = new ArrayList<>();
		for (Update update : updates) {
			SetId holder = occupied.get(slotKey(update.command().rowLabel(), update.command().positionNo()));
			if (holder != null && !holder.equals(update.stored().id())) {
				colliding.add(update.stored().id());
			}
		}
		return List.copyOf(colliding);
	}

	private static String cellKey(int gridX, int gridY) {
		return gridX + " " + gridY;
	}

	private static String slotKey(String rowLabel, int positionNo) {
		return rowLabel + '\u0000' + positionNo;
	}
}
