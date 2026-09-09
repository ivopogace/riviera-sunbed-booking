package ai.riviera.platform.booking.application.remodel;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/** Serves {@link ViewRemodelReceipts}: ownership first, then the venue-scoped read. */
@Service
class RemodelReceiptService implements ViewRemodelReceipts {

	private final VenueOwnership ownership;
	private final RemodelReceipts receipts;

	RemodelReceiptService(VenueOwnership ownership, RemodelReceipts receipts) {
		this.ownership = ownership;
		this.receipts = receipts;
	}

	@Override
	@Transactional(readOnly = true)
	public List<RemodelReceipt> receiptsOf(OperatorId operator, VenueId venueId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		return receipts.receiptsOf(venueId);
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<RemodelReceipt> receipt(OperatorId operator, VenueId venueId, ReceiptId receiptId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		return receipts.find(venueId, receiptId);
	}
}
