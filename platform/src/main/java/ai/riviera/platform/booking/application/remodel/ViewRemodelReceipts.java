package ai.riviera.platform.booking.application.remodel;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The owner's read of a venue's remodel-commit receipts (the console's "past remodels"): the list,
 * newest first, and one by id. Owner-asserted in the service (invariant #13); a receipt of another
 * venue reads as absent. Module-internal driving port for the REST adapter.
 */
public interface ViewRemodelReceipts {

	List<RemodelReceipt> receiptsOf(OperatorId operator, VenueId venueId);

	Optional<RemodelReceipt> receipt(OperatorId operator, VenueId venueId, ReceiptId receiptId);
}
