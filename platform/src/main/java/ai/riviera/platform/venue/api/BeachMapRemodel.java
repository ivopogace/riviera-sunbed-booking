package ai.riviera.platform.venue.api;

import java.util.List;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.LayoutCommitOutcome;
import ai.riviera.platform.venue.vocabulary.LayoutPreview;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's published <strong>remodel</strong> port (invariant #11). {@link #preview}:
 * what a bulk beach-map save would disturb, judged exactly as the save judges it — the same
 * cell-keyed diff against the active map — but under no lock and writing nothing. {@link #commit}:
 * the save itself, with the caller's {@link RemodelGate} asked between the locks and the write.
 * Consumed by the platform edge, which composes both with {@code booking} (ADR-0020); {@code venue}
 * never learns what a booking is.
 */
public interface BeachMapRemodel {

	/**
	 * The sets the submitted cells would remove or renumber, with their walk-in holds, or a rejection
	 * when the venue is unknown or {@code expectedVersion} is not the current {@code set_version}.
	 * Owner-asserted first (invariant #13). Advisory: the save re-diffs under its row locks.
	 */
	LayoutPreview preview(OperatorId operator, VenueId venueId, long expectedVersion, List<SetPlacement> cells);

	/**
	 * Save the layout in one transaction this port owns: ownership first (invariant #13), the save's
	 * shape and {@code expectedVersion} checks, the venue row then every active set row locked
	 * {@code FOR UPDATE}, the diff, then {@code gate} with the disturbed sets and their holds — whatever
	 * the caller does inside it shares the transaction and the locks — then the save's own live-claim
	 * probe, then the write. A refusing gate writes nothing and spends no token. The layout diff and
	 * every move the gate made commit together or not at all (invariant #2).
	 */
	LayoutCommitOutcome commit(OperatorId operator, VenueId venueId, long expectedVersion, List<LayoutCell> cells,
			RemodelGate gate);
}
