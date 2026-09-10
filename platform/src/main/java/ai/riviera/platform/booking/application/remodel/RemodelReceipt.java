package ai.riviera.platform.booking.application.remodel;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * What one remodel commit did to the bookings on the sets it removed or renumbered, as the venue's
 * owner reads it afterwards: who committed it, when, every move, every claim it ended instead, and
 * the operator's reason for the refunds ({@code ""} when it refunded nothing). Written in the
 * moves' own transaction, so a receipt and its lines are one fact. Module-internal; public for the
 * module's own adapters.
 */
public record RemodelReceipt(ReceiptId id, VenueId venueId, OperatorId operatorId, Instant committedAt,
		List<ReceiptMove> moves, List<ReceiptOutcome> outcomes, String refundReason) {

	public RemodelReceipt {
		moves = List.copyOf(moves);
		outcomes = List.copyOf(outcomes);
	}

	/** The refund lines, in receipt order — the ones the operator had to type a count for. */
	public List<ReceiptOutcome> refunds() {
		return outcomes.stream().filter(outcome -> outcome.kind() == ReceiptOutcomeKind.REFUND).toList();
	}

	/** What this commit returned to guests, in integer minor units (invariant #5); 0 when it refunded nothing. */
	public long refundedMinor() {
		return refunds().stream().mapToLong(ReceiptOutcome::amountMinor).sum();
	}

	/** What this commit cost the venue in fees — the amounts charged then, not today's rate; 0 when it refunded nothing. */
	public long feeTotalMinor() {
		return refunds().stream().mapToLong(ReceiptOutcome::feeMinor).sum();
	}
}
