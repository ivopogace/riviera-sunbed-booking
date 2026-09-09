package ai.riviera.platform.venue.application;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The bulk beach-map save as a diff of the submitted layout against the stored active map, keyed
 * by grid cell: a stored set whose cell the submission still names is an {@link Update} under its
 * own id (whatever the label, position, tier, pool or price now say), a submitted cell no stored
 * set occupies is an insert, and a stored set whose cell is absent is removed. Only the removed
 * sets can disturb a guest, so only they are probed for a live claim. A set that changes cell
 * reaches this diff as a removal plus an insert: the request carries no ids, so the cell is the
 * identity. Rationale: RESPONSIBILITIES.md §venue.
 */
record LayoutDiff(List<Update> updates, List<SetCommand> inserts, List<PlacedSet> removed) {

	/** A kept cell: the stored set's id and the fields the submission wants on it. */
	record Update(SetId id, SetCommand command) {
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
				updates.add(new Update(kept.id(), cell));
			}
		}
		List<PlacedSet> removed = stored.stream().filter(byCell::containsValue).toList();
		return new LayoutDiff(List.copyOf(updates), List.copyOf(inserts), removed);
	}

	private static String cellKey(int gridX, int gridY) {
		return gridX + " " + gridY;
	}
}
