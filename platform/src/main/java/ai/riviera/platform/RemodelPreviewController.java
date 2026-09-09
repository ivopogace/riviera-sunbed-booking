package ai.riviera.platform;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.api.BeachMapRemodel;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutPreview;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The remodel preview: a dry run of the bulk beach-map save that answers what it would do to every
 * live claim, without writing. Lives at the platform edge because it composes two modules that may
 * not see each other — {@code venue} diffs the cells and names the disturbed sets with their
 * walk-in holds, {@code booking} classifies the live bookings on them — and only the root may reach
 * both (ADR-0020). Each port asserts venue ownership itself (invariant #13); the edge resolves the
 * principal, maps the rejections and hands the two answers to {@link RemodelPreviewAssembler}.
 *
 * <p>The outcome→HTTP map: a preview → {@code 200}; {@code NO_SUCH_VENUE} → {@code 404};
 * {@code STALE_WRITE} → {@code 409}; a non-owner → {@code 403} via {@code ApiErrorHandler}. The
 * answer is a snapshot: the commit re-decides under its locks against the token this answer carries.
 */
@RestController
@RequestMapping("/api/venues")
class RemodelPreviewController {

	/** The venue module's wording for the same codes: one {@code set_version} token, one sentence. */
	private static final String NO_SUCH_VENUE_DETAIL = "No such venue.";
	private static final String STALE_SETS_DETAIL =
			"This venue's sets have changed since the version this request carries.";

	private final CurrentOperator currentOperator;
	private final BeachMapRemodel remodel;
	private final RemodelClaims claims;

	RemodelPreviewController(CurrentOperator currentOperator, BeachMapRemodel remodel, RemodelClaims claims) {
		this.currentOperator = currentOperator;
		this.remodel = remodel;
		this.claims = claims;
	}

	@PostMapping("/{venueId}/beach-map/preview")
	ResponseEntity<?> preview(Authentication authentication, @PathVariable long venueId,
			@RequestBody RemodelPreviewRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		long expectedVersion = InvalidApiRequestException.parsing(request::requireExpectedVersion);
		var cells = InvalidApiRequestException.parsing(request::toPlacements);
		VenueId venue = new VenueId(venueId);
		return switch (remodel.preview(operator, venue, expectedVersion, cells)) {
			case LayoutPreview.Disturbing(var disturbed) -> ResponseEntity.ok(RemodelPreviewAssembler.assemble(disturbed,
					disturbed.isEmpty() ? List.of()
							: claims.classify(operator, venue, disturbed.stream().map(DisturbedSet::setId).toList())));
			case LayoutPreview.Rejected(var reason) -> switch (reason) {
				case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(), NO_SUCH_VENUE_DETAIL);
				case STALE_WRITE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(), STALE_SETS_DETAIL);
			};
		};
	}
}
