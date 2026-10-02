package ai.riviera.platform.booking.application.remodel;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code booking} module's driven port onto the commit receipts ({@code remodel_receipt},
 * {@code remodel_receipt_move}, {@code remodel_receipt_outcome}, {@code remodel_receipt_kept}). Implemented by
 * {@code JdbcRemodelReceipts} (explicit SQL, invariant #1). A venue-scoped read leaves the ownership check to
 * the service (invariant #13); a booking-keyed read serves a system caller with no operator.
 */
public interface RemodelReceipts {

	/** Persist a receipt with its moves, ended and kept claims in the caller's transaction and answer its id. */
	ReceiptId store(NewReceipt receipt);

	/** The venue's receipts with their moves, ended and kept claims, newest first. */
	List<RemodelReceipt> receiptsOf(VenueId venueId);

	/** One receipt, or empty when no receipt of this venue has the id — a foreign venue's reads as absent. */
	Optional<RemodelReceipt> find(VenueId venueId, ReceiptId receiptId);

	/** The most recent move of a booking, or empty when no remodel ever moved it. */
	Optional<ReceiptMove> latestMoveOf(BookingId bookingId);

	/** Whether a remodel commit ended this booking — refunded, released, declined or nothing left; a kept one was not. */
	boolean endedByRemodel(BookingId bookingId);

	/** Whether a remodel commit released this booking unpaid; a refund line, however small, is not a release (#1291). */
	boolean releasedByRemodel(BookingId bookingId);
}
