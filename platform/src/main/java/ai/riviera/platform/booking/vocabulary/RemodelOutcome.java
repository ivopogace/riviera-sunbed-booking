package ai.riviera.platform.booking.vocabulary;

/**
 * What a remodel would do to one live claim on a disturbed set, decided by {@code booking}: a
 * {@link Move} to a set of the same or better tier free on every day of the claim, or — with no
 * candidate beyond the refund-notice floor — a {@link Refund} of a confirmed booking, a {@link Release}
 * of an unpaid one; a pending request is a {@link Decline} in every zone, a confirmed booking with every day
 * refunded is {@link NothingLeft} in any unfrozen one; a {@link Blocked} claim is kept, its set as stored.
 * Sealed so a switch is exhaustive; the preview is advisory, the commit re-derives it.
 */
public sealed interface RemodelOutcome
		permits RemodelOutcome.Move, RemodelOutcome.Refund, RemodelOutcome.Release, RemodelOutcome.Decline,
		RemodelOutcome.NothingLeft, RemodelOutcome.Blocked {

	/** The booking moves to {@code to}, {@code rowsAway} rows and {@code positionsAway} positions from its set. */
	record Move(SpotRef to, int rowsAway, int positionsAway) implements RemodelOutcome {
	}

	/** A confirmed booking is cancelled with a full refund. */
	enum Refund implements RemodelOutcome { REFUND }

	/** An unpaid booking is released, a stay's other unpaid stretches with it (#1292); no money is involved. */
	enum Release implements RemodelOutcome { RELEASE }

	/** A pending request is declined; no money is involved. */
	enum Decline implements RemodelOutcome { DECLINE }

	/** A confirmed booking every day of which is already refunded ends quietly: no refund, fee, mail or move (#1300). */
	enum NothingLeft implements RemodelOutcome { NOTHING_LEFT }

	/** The claim cannot be honoured elsewhere: it is kept where it is, and its set stays as stored. */
	record Blocked(BlockReason reason) implements RemodelOutcome {
	}
}
