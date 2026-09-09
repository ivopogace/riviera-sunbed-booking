package ai.riviera.platform.booking.application.remodel;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code booking} module's driven port onto the commit receipts ({@code remodel_receipt},
 * {@code remodel_receipt_move}). Implemented by {@code JdbcRemodelReceipts} (explicit SQL,
 * invariant #1). Venue-scoped reads only: the ownership check is the service's (invariant #13).
 */
public interface RemodelReceipts {

	/** Persist a receipt with its moves in the caller's transaction and answer its id. */
	ReceiptId store(VenueId venueId, OperatorId operatorId, Instant committedAt, List<ReceiptMove> moves);

	/** The venue's receipts with their moves, newest first. */
	List<RemodelReceipt> receiptsOf(VenueId venueId);

	/** One receipt, or empty when no receipt of this venue has the id — a foreign venue's reads as absent. */
	Optional<RemodelReceipt> find(VenueId venueId, ReceiptId receiptId);

	/** The most recent move of a booking, or empty when no remodel ever moved it. */
	Optional<ReceiptMove> latestMoveOf(BookingId bookingId);
}
