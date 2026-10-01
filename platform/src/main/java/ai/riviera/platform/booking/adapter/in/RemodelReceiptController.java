package ai.riviera.platform.booking.adapter.in;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.booking.application.remodel.ViewRemodelReceipts;
import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The owner's read of a venue's remodel-commit receipts — the console's "past remodels": the list,
 * newest first, and one receipt by id. Venue-scoped and owner-asserted in the service (invariant
 * #13): a non-owner is {@code 403}, a receipt of another venue {@code 404 NO_SUCH_RECEIPT}, exactly
 * as an unknown id. Driving adapter; the decisions are {@link ViewRemodelReceipts}'s.
 */
@RestController
@RequestMapping("/api/venues")
class RemodelReceiptController {

	private static final String NO_SUCH_RECEIPT_CODE = "NO_SUCH_RECEIPT";

	private final ViewRemodelReceipts receipts;
	private final OperatorDirectory operatorDirectory;

	RemodelReceiptController(ViewRemodelReceipts receipts, OperatorDirectory operatorDirectory) {
		this.receipts = receipts;
		this.operatorDirectory = operatorDirectory;
	}

	@GetMapping("/{venueId}/remodels")
	List<RemodelReceiptView.Summary> list(Authentication authentication, @PathVariable long venueId) {
		OperatorId operator = operatorDirectory.requireOperator(authentication.getName());
		return receipts.receiptsOf(operator, new VenueId(venueId)).stream()
				.map(RemodelReceiptView.Summary::of)
				.toList();
	}

	@GetMapping("/{venueId}/remodels/{receiptId}")
	ResponseEntity<?> one(Authentication authentication, @PathVariable long venueId, @PathVariable long receiptId) {
		OperatorId operator = operatorDirectory.requireOperator(authentication.getName());
		return receipts.receipt(operator, new VenueId(venueId), new ReceiptId(receiptId))
				.<ResponseEntity<?>>map(receipt -> ResponseEntity.ok(RemodelReceiptView.of(receipt)))
				.orElseGet(() -> ApiProblem.response(HttpStatus.NOT_FOUND, NO_SUCH_RECEIPT_CODE,
						"No such remodel receipt at this venue."));
	}
}
