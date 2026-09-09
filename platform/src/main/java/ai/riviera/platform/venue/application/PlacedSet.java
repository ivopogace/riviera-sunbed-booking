package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One active set of a venue's map as the bulk save locks it: its id and where it sits. The grid
 * cell in {@link #placement} is the key the save diffs on; the row label and position number are
 * what a refusal names the set by.
 */
public record PlacedSet(SetId id, SetPlacement placement) {

	/** The label an operator knows the set by, e.g. {@code A3}. */
	public String label() {
		return placement.rowLabel() + placement.positionNo();
	}
}
