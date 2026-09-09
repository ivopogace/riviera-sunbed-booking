package ai.riviera.platform.booking.vocabulary;

import java.time.Instant;
import java.util.List;

/**
 * What {@code booking} answered a remodel commit: the moves were applied and receipted
 * ({@link Applied}); the preview token no longer covers the claims re-derived under lock — a new
 * booking or a changed kind — ({@link Stale}, with the fresh classification); or the fresh
 * classification holds an outcome the commit does not apply — a refund, release, decline or block
 * — ({@link Refused}, with it). Only {@link Applied} wrote anything. Sealed so the edge's switch is
 * exhaustive.
 */
public sealed interface RemodelCommit permits RemodelCommit.Applied, RemodelCommit.Stale, RemodelCommit.Refused {

	/** Every booking moved, as receipted; {@code moves} carries a {@link RemodelOutcome.Move} each. */
	record Applied(ReceiptId receiptId, Instant committedAt, List<RemodelClaim> moves) implements RemodelCommit {
		public Applied {
			moves = List.copyOf(moves);
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
}
