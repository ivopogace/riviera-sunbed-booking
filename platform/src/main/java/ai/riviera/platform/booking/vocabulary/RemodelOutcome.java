package ai.riviera.platform.booking.vocabulary;

/**
 * What a remodel would do to one live claim on a disturbed set, decided by {@code booking}: a
 * {@link Move} to a free set of the same or better tier on the same date, or — with no candidate
 * beyond the refund-notice floor — a {@link Refund} of a confirmed booking, a {@link Release} of an
 * unpaid one, a {@link Decline} of a pending request; a {@link Blocked} claim pins its set. Sealed
 * so the edge's switch is exhaustive; the preview is advisory, the commit re-derives it.
 */
public sealed interface RemodelOutcome
		permits RemodelOutcome.Move, RemodelOutcome.Refund, RemodelOutcome.Release, RemodelOutcome.Decline,
		RemodelOutcome.Blocked {

	/** The booking moves to {@code to}, {@code rowsAway} rows and {@code positionsAway} positions from its set. */
	record Move(SpotRef to, int rowsAway, int positionsAway) implements RemodelOutcome {
	}

	/** A confirmed booking is cancelled with a full refund. */
	enum Refund implements RemodelOutcome { REFUND }

	/** An unpaid booking is released; no money is involved. */
	enum Release implements RemodelOutcome { RELEASE }

	/** A pending request is declined; no money is involved. */
	enum Decline implements RemodelOutcome { DECLINE }

	/** The claim cannot be honoured elsewhere: the set must stay in the save. */
	record Blocked(BlockReason reason) implements RemodelOutcome {
	}
}
