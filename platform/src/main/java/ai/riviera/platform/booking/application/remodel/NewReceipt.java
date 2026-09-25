package ai.riviera.platform.booking.application.remodel;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * A commit receipt as it is written: who committed it, when, every booking it moved, every claim it
 * ended instead, the free text the operator had to give when it refunded anything (empty when it
 * refunded nothing, which is the only case where no reason is owed), and every claim it kept where
 * it was. Module-internal; public for the module's own adapters.
 */
public record NewReceipt(VenueId venueId, OperatorId operatorId, Instant committedAt,
		List<ReceiptMove> moves, List<ReceiptOutcome> outcomes, String refundReason, List<ReceiptKept> kept) {

	public NewReceipt {
		moves = List.copyOf(moves);
		outcomes = List.copyOf(outcomes);
		kept = List.copyOf(kept);
	}
}
