package ai.riviera.platform.payout.application;

import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;

/**
 * The result of a batch status transition (U9, issue #12) — a closed, caller-mappable set (typed
 * outcomes for expected flows, not exceptions). The web adapter {@code switch}es exhaustively:
 * {@link Marked} → 200, {@link NotFound} → 404, {@link IllegalTransition} → 409.
 */
public sealed interface BatchStatusOutcome
		permits BatchStatusOutcome.Marked, BatchStatusOutcome.NotFound, BatchStatusOutcome.IllegalTransition {

	/** The transition was applied; {@code batch} is the updated batch. */
	record Marked(PayoutBatch batch) implements BatchStatusOutcome {
	}

	/** No batch has that id. */
	record NotFound() implements BatchStatusOutcome {
	}

	/** {@code from → to} is not a legal forward transition (DRAFT→REPORTED→SETTLED). */
	record IllegalTransition(BatchStatus from, BatchStatus to) implements BatchStatusOutcome {
	}
}
