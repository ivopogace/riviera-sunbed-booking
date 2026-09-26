package ai.riviera.platform;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.vocabulary.LockedSet;

/**
 * What the edge's remodel commit answered, for the controller to map; only {@link Committed}
 * (layout saved, every claim applied) writes anything. With the fresh picture: {@link StalePreview}
 * (the claims changed since the preview — a new one, a changed kind, a staff hold),
 * {@link Refused} (the layout gives a kept set's row and position to another set), and
 * {@link NotConfirmed} (it refunds guests; the typed count and reason do not authorise it).
 * {@link SetsInUse}: the save's live-claim probe found a claim; {@link Rejected}: shape and token.
 */
sealed interface RemodelCommitOutcome {

	record Committed(ReceiptId receiptId, java.time.Instant committedAt, List<RemodelClaim> settled)
			implements RemodelCommitOutcome {
	}

	record StalePreview(List<DisturbedSet> disturbed, List<RemodelClaim> fresh) implements RemodelCommitOutcome {
	}

	record Refused(List<DisturbedSet> disturbed, List<RemodelClaim> fresh) implements RemodelCommitOutcome {
	}

	/** The fresh picture's own refund count is the number the operator must type; it needs no second copy. */
	record NotConfirmed(List<DisturbedSet> disturbed, List<RemodelClaim> fresh) implements RemodelCommitOutcome {
	}

	record SetsInUse(List<LockedSet> sets) implements RemodelCommitOutcome {
	}

	record Rejected(LayoutRejection reason) implements RemodelCommitOutcome {
	}
}
