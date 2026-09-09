package ai.riviera.platform.venue.api;

import java.util.List;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.LayoutPreview;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's published <strong>remodel</strong> port (invariant #11): what a bulk
 * beach-map save would disturb, judged exactly as the save judges it — the same cell-keyed diff
 * against the active map — but under no lock and writing nothing. Consumed by the platform edge,
 * which composes it with {@code booking}'s classification (ADR-0020); {@code venue} never learns
 * what a booking is.
 */
public interface BeachMapRemodel {

	/**
	 * The sets the submitted cells would remove or renumber, with their walk-in holds, or a rejection
	 * when the venue is unknown or {@code expectedVersion} is not the current {@code set_version}.
	 * Owner-asserted first (invariant #13). Advisory: the save re-diffs under its row locks.
	 */
	LayoutPreview preview(OperatorId operator, VenueId venueId, long expectedVersion, List<SetPlacement> cells);
}
