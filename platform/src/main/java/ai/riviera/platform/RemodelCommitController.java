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
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The remodel commit: the bulk beach-map save that also moves the bookings its layout disturbs, at
 * the platform edge because it composes {@code venue}'s write with {@code booking}'s moves
 * (ADR-0020; {@link RemodelCommitService} is the gate). The outcome→HTTP map: committed →
 * {@code 200} with the receipt and the moves; a picture the preview no longer describes →
 * {@code 409 STALE_PREVIEW}; a picture with anything but moves → {@code 409 REMODEL_REFUSED} — both
 * carrying the fresh {@code preview}, token included, so the editor re-renders the dialog; the save's
 * own refusals and rejections in the save's words and codes; a non-owner → {@code 403} via
 * {@code ApiErrorHandler}. Nothing is written on any answer but {@code 200}.
 */
@RestController
@RequestMapping("/api/venues")
class RemodelCommitController {

	static final String STALE_PREVIEW_CODE = "STALE_PREVIEW";
	static final String REMODEL_REFUSED_CODE = "REMODEL_REFUSED";
	static final String SETS_IN_USE_CODE = "SETS_IN_USE";
	static final String PREVIEW_PROPERTY = "preview";
	static final String SETS_PROPERTY = "sets";
	/** The venue module's wording for the same codes: one {@code set_version} token, one sentence. */
	private static final String NO_SUCH_VENUE_DETAIL = "No such venue.";
	private static final String STALE_SETS_DETAIL =
			"This venue's sets have changed since the version this request carries.";

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
		return switch (commits.commit(operator, new VenueId(venueId), expectedVersion, cells, token)) {
			case RemodelCommitOutcome.Committed committed -> ResponseEntity.ok(RemodelCommitResponse.of(committed));
			case RemodelCommitOutcome.StalePreview(var disturbed, var fresh) -> withPreview(
					ApiProblem.of(HttpStatus.CONFLICT, STALE_PREVIEW_CODE,
							"The bookings this remodel affects have changed since the preview."),
					RemodelPreviewAssembler.assemble(disturbed, fresh));
			case RemodelCommitOutcome.Refused(var disturbed, var fresh) -> withPreview(
					ApiProblem.of(HttpStatus.CONFLICT, REMODEL_REFUSED_CODE,
							"The remodel affects a booking that cannot be moved."),
					RemodelPreviewAssembler.assemble(disturbed, fresh));
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

	/** The bulk save's map, sentence for sentence, so one code reads the same whichever route answered it. */
	private static ResponseEntity<ProblemDetail> error(LayoutRejection reason) {
		return switch (reason) {
			case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(), NO_SUCH_VENUE_DETAIL);
			case STALE_WRITE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(), STALE_SETS_DETAIL);
			case CELL_TAKEN -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Two sets occupy the same grid cell.");
			case DUPLICATE_POSITION -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Two sets share the same row and position.");
			case ROW_NAME_TAKEN -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Two rows in this layout share the same name.");
			case EMPTY_LAYOUT -> ApiProblem.response(HttpStatus.BAD_REQUEST, reason.name(),
					"A layout must have at least one set.");
			case LAYOUT_TOO_LARGE -> ApiProblem.response(HttpStatus.BAD_REQUEST, reason.name(),
					"The layout exceeds the maximum grid size.");
		};
	}
}
