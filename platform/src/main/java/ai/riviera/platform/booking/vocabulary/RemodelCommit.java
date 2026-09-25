package ai.riviera.platform.booking.vocabulary;

import java.time.Instant;
import java.util.List;

/**
 * What {@code booking} answered a remodel commit: every claim was settled and receipted
 * ({@link Applied}); the preview token no longer covers the claims re-derived under lock — a new
 * booking or a changed kind — ({@link Stale}, with the fresh classification); or it refunds guests
 * and the operator's typed count and reason do not authorise it ({@link Unconfirmed}). Only
 * {@link Applied} wrote anything. Sealed so the edge's switch is exhaustive.
 */
public sealed interface RemodelCommit permits RemodelCommit.Applied, RemodelCommit.Stale, RemodelCommit.Unconfirmed {

	/**
	 * Every claim the commit settled, as receipted — moves, refunds, releases, declines and the
	 * {@link RemodelOutcome.Blocked} claims kept where they are — in the order they were classified.
	 * The caller keeps every kept claim's set as stored.
	 */
	record Applied(ReceiptId receiptId, Instant committedAt, List<RemodelClaim> settled) implements RemodelCommit {
		public Applied {
			settled = List.copyOf(settled);
		}
	}

	record Stale(List<RemodelClaim> fresh) implements RemodelCommit {
		public Stale {
			fresh = List.copyOf(fresh);
		}
	}

	/** How many refunds the operator must type is the fresh picture's own count, never a second copy. */
	record Unconfirmed(List<RemodelClaim> fresh) implements RemodelCommit {
		public Unconfirmed {
			fresh = List.copyOf(fresh);
		}
	}
}
