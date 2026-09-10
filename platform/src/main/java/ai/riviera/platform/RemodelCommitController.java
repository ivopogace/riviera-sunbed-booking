package ai.riviera.platform;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The remodel commit: the bulk beach-map save that also settles the claims its layout disturbs, at
 * the platform edge because it composes {@code venue}'s write with {@code booking}'s moves, refunds,
 * releases and declines (ADR-0020; {@link RemodelCommitService} is the gate). The outcome→HTTP map:
 * committed → {@code 200} with the receipt and every applied claim; a picture the preview no longer
 * describes → {@code 409 STALE_PREVIEW}; a picture holding a claim that pins its set →
 * {@code 409 REMODEL_REFUSED}; a picture that refunds guests without the typed count and a reason →
 * {@code 409 REFUND_NOT_CONFIRMED}, which additionally names the count owed — all three carrying the
 * fresh {@code preview}, token included, so the editor re-renders the dialog; the save's own refusals
 * and rejections in the save's words and codes; a non-owner → {@code 403} via
 * {@code ApiErrorHandler}. Nothing is written on any answer but {@code 200}.
 */
@RestController
@RequestMapping("/api/venues")
class RemodelCommitController {

	static final String STALE_PREVIEW_CODE = "STALE_PREVIEW";
	static final String REMODEL_REFUSED_CODE = "REMODEL_REFUSED";
	static final String REFUND_NOT_CONFIRMED_CODE = "REFUND_NOT_CONFIRMED";
	static final String SETS_IN_USE_CODE = "SETS_IN_USE";
	static final String PREVIEW_PROPERTY = "preview";
	static final String SETS_PROPERTY = "sets";
	static final String REFUND_COUNT_PROPERTY = "requiredRefundCount";

	private final CurrentOperator currentOperator;
	private final RemodelCommitService commits;

	RemodelCommitController(CurrentOperator currentOperator, RemodelCommitService commits) {
		this.currentOperator = currentOperator;
		this.commits = commits;
	}

	@PostMapping("/{venueId}/beach-map/commit")
	ResponseEntity<?> commit(Authentication authentication, @PathVariable long venueId,
			@RequestBody RemodelCommitRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		long expectedVersion = InvalidApiRequestException.parsing(request::requireExpectedVersion);
		List<LayoutCell> cells = InvalidApiRequestException.parsing(request::toCells);
		PreviewToken token = InvalidApiRequestException.parsing(request::requireToken);
		RefundConfirmation confirmation = request.confirmation();
		return switch (commits.commit(operator, new VenueId(venueId), expectedVersion, cells, token, confirmation)) {
			case RemodelCommitOutcome.Committed committed ->
				ResponseEntity.ok(RemodelCommitResponse.of(committed, confirmation.reason()));
			case RemodelCommitOutcome.StalePreview(var disturbed, var fresh) -> withPreview(
					ApiProblem.of(HttpStatus.CONFLICT, STALE_PREVIEW_CODE,
							"The bookings this remodel affects have changed since the preview."),
					RemodelPreviewAssembler.assemble(disturbed, fresh));
			case RemodelCommitOutcome.Refused(var disturbed, var fresh) -> withPreview(
					ApiProblem.of(HttpStatus.CONFLICT, REMODEL_REFUSED_CODE,
							"The remodel affects a booking that cannot be moved or ended."),
					RemodelPreviewAssembler.assemble(disturbed, fresh));
			case RemodelCommitOutcome.NotConfirmed(var disturbed, var fresh, var refundCount) -> {
				ProblemDetail problem = ApiProblem.of(HttpStatus.CONFLICT, REFUND_NOT_CONFIRMED_CODE,
						"A remodel that refunds guests needs the refund count typed out and a reason.");
				problem.setProperty(REFUND_COUNT_PROPERTY, refundCount);
				yield withPreview(problem, RemodelPreviewAssembler.assemble(disturbed, fresh));
			}
			case RemodelCommitOutcome.SetsInUse(var sets) -> {
				ProblemDetail problem = ApiProblem.of(HttpStatus.CONFLICT, SETS_IN_USE_CODE,
						"Sets this save would remove are booked or held.");
				problem.setProperty(SETS_PROPERTY, sets.stream().map(RemodelCommitResponse.LockedSetView::of).toList());
				yield ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
			}
			case RemodelCommitOutcome.Rejected(var reason) -> error(reason);
		};
	}

	private static ResponseEntity<ProblemDetail> withPreview(ProblemDetail problem, RemodelPreviewResponse preview) {
		problem.setProperty(PREVIEW_PROPERTY, preview);
		return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
	}

	/** The bulk save's map, sentence for sentence: both read off the rejection itself. */
	private static ResponseEntity<ProblemDetail> error(LayoutRejection reason) {
		return ApiProblem.response(statusOf(reason.fault()), reason.name(), reason.detail());
	}

	private static HttpStatus statusOf(LayoutRejection.Fault fault) {
		return switch (fault) {
			case NOT_FOUND -> HttpStatus.NOT_FOUND;
			case CONFLICT -> HttpStatus.CONFLICT;
			case INVALID -> HttpStatus.BAD_REQUEST;
		};
	}
}
