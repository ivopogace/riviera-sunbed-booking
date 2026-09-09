package ai.riviera.platform.booking.application.remodel;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * What one remodel commit did to the bookings on the sets it removed or renumbered, as the venue's
 * owner reads it afterwards: who committed it, when, and every move. Written in the moves' own
 * transaction, so a receipt and its moves are one fact. Module-internal; public for the module's own
 * adapters.
 */
public record RemodelReceipt(ReceiptId id, VenueId venueId, OperatorId operatorId, Instant committedAt,
		List<ReceiptMove> moves) {

	public RemodelReceipt {
		moves = List.copyOf(moves);
	}
}
