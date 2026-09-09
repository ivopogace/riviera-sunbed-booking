package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;
import java.util.List;

/**
 * A stored set a layout save would remove or renumber — the only edits a guest can be stranded by —
 * with its placement and the days from today on which staff hold it for a walk-in, oldest first
 * (empty when none). Bookings on it are {@code booking}'s to classify.
 */
public record DisturbedSet(SetId setId, SetPlacement placement, List<LocalDate> walkInHolds) {

	public DisturbedSet {
		walkInHolds = List.copyOf(walkInHolds);
	}
}
