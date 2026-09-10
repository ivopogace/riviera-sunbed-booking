package ai.riviera.platform.booking.vocabulary;

import java.time.Instant;
import java.util.List;

/**
 * What {@code booking} answered a remodel commit: every claim was applied and receipted
 * ({@link Applied}); the preview token no longer covers the claims re-derived under lock — a new
 * booking or a changed kind — ({@link Stale}, with the fresh classification); the fresh
 * classification holds a claim that pins its set ({@link Refused}, with it); or it refunds guests
 * and the operator's typed count and reason do not authorise it ({@link Unconfirmed}, with the
 * count they owe). Only {@link Applied} wrote anything. Sealed so the edge's switch is exhaustive.
 */
public sealed interface RemodelCommit
		permits RemodelCommit.Applied, RemodelCommit.Stale, RemodelCommit.Refused, RemodelCommit.Unconfirmed {

	/**
	 * Every claim the commit applied, as receipted — moves, refunds, releases and declines, in the
	 * order they were classified.
	 */
	record Applied(ReceiptId receiptId, Instant committedAt, List<RemodelClaim> applied) implements RemodelCommit {
		public Applied {
			applied = List.copyOf(applied);
		}
	}

	record Stale(List<RemodelClaim> fresh) implements RemodelCommit {
		public Stale {
			fresh = List.copyOf(fresh);
		}
	}

	record Refused(List<RemodelClaim> fresh) implements RemodelCommit {
		public Refused {
			fresh = List.copyOf(fresh);
		}
	}

	/** {@code refundCount} is how many refunds the fresh picture holds — what the operator must type. */
	record Unconfirmed(List<RemodelClaim> fresh, int refundCount) implements RemodelCommit {
		public Unconfirmed {
			fresh = List.copyOf(fresh);
		}
	}
}
