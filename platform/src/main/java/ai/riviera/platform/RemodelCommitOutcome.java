package ai.riviera.platform;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.vocabulary.LockedSet;

/**
 * What the edge's remodel commit answered, for the controller to map: the layout is saved and every
 * claim on it applied ({@link Committed}); the preview no longer describes the claims — a new one, a
 * changed kind, a staff hold — ({@link StalePreview}, with the fresh picture); the layout gives a
 * kept set's row and position to another set ({@link Refused}, with the fresh picture); it refunds
 * guests and the operator's typed
 * count and reason do not authorise it ({@link NotConfirmed}); the save's own live-claim probe still
 * found a claim ({@link SetsInUse}); or the save's shape and token rejections ({@link Rejected}).
 * Only the first writes anything.
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
