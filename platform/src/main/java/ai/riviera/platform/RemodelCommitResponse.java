package ai.riviera.platform;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.venue.vocabulary.LockedSet;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * A committed remodel on the wire: the receipt the console can open later and every move it made,
 * in the preview's own move shape. Bookings by id, never by code (invariant #7).
 */
record RemodelCommitResponse(long receiptId, Instant committedAt, List<RemodelPreviewResponse.MoveView> moves) {

	static RemodelCommitResponse of(RemodelCommitOutcome.Committed committed) {
		return new RemodelCommitResponse(committed.receiptId().value(), committed.committedAt(),
				committed.moves().stream().map(RemodelCommitResponse::moveOf).toList());
	}

	private static RemodelPreviewResponse.MoveView moveOf(RemodelClaim claim) {
		if (!(claim.outcome() instanceof RemodelOutcome.Move(var to, var rowsAway, var positionsAway))) {
			throw new IllegalStateException("a committed remodel carries moves only");
		}
		return new RemodelPreviewResponse.MoveView(claim.bookingId().value(), claim.bookingDate().toString(),
				new MoneyView(claim.amountMinor(), claim.currency()), RemodelPreviewAssembler.spot(claim.from()),
				RemodelPreviewAssembler.spot(to), rowsAway, positionsAway);
	}

	/** One set a {@code 409 SETS_IN_USE} names, in the bulk save's own wire shape. */
	record LockedSetView(long setId, String rowLabel, int positionNo, String bookedOn, String heldOn) {

		static LockedSetView of(LockedSet locked) {
			return new LockedSetView(locked.setId().value(), locked.placement().rowLabel(),
					locked.placement().positionNo(),
					locked.bookedOn() == null ? null : locked.bookedOn().toString(),
					locked.heldOn() == null ? null : locked.heldOn().toString());
		}
	}
}
