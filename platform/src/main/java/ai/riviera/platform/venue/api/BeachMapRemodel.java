package ai.riviera.platform.venue.api;

import java.util.List;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.LayoutCommitOutcome;
import ai.riviera.platform.venue.vocabulary.LayoutPreview;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's published <strong>remodel</strong> port (invariant #11), composed with
 * {@code booking} by the platform edge (ADR-0020); {@code venue} never learns what a booking is.
 * {@link #preview}: what a bulk beach-map save would disturb, by the save's own cell-keyed diff
 * against the active map, under no lock and writing nothing. {@link #commit}: the save itself, with
 * the caller's {@link RemodelGate} asked between the locks and the write. Rationale:
 * RESPONSIBILITIES.md §venue (the remodel preview and commit).
 */
public interface BeachMapRemodel {

	/**
	 * The sets the submitted cells would remove or renumber, with their walk-in holds, or a rejection
	 * when the venue is unknown or {@code expectedVersion} is not the current {@code set_version}.
	 * Owner-asserted first (invariant #13). Advisory: the save re-diffs under its row locks.
	 */
	LayoutPreview preview(OperatorId operator, VenueId venueId, long expectedVersion, List<SetPlacement> cells);

	/**
	 * Save the layout in one transaction: owner check (invariant #13), token, row locks, diff, then
	 * {@code gate} (sharing transaction and locks), probe of unkept sets, write. A decline or
	 * {@code KeptSetsDisplaced} writes nothing, spends no token; all-or-nothing (invariant #2).
	 */
	LayoutCommitOutcome commit(OperatorId operator, VenueId venueId, long expectedVersion, List<LayoutCell> cells,
			RemodelGate gate);
}
