package ai.riviera.platform.venue.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.application.CloseForSeason;
import ai.riviera.platform.venue.application.CloseOutcome;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The owner's close/reopen endpoint — {@code PUT} closes (replacing any closure in force) and
 * answers the counts, {@code DELETE} reopens. Driving adapter on {@link CloseForSeason}
 * (invariant #11); the operator session and role are the edge's ({@code SecurityConfig}), the
 * ownership check the service's (invariant #13, {@code 403} via {@code ApiErrorHandler}).
 * {@code NO_SUCH_VENUE}→404, {@code REOPEN_DATE_PASSED}→422, malformed→400.
 */
@RestController
@RequestMapping("/api/venues/{venueId}/season-closure")
class SeasonClosureController {

	private final CloseForSeason closeForSeason;
	private final CurrentOperator currentOperator;

	SeasonClosureController(CloseForSeason closeForSeason, CurrentOperator currentOperator) {
		this.closeForSeason = closeForSeason;
		this.currentOperator = currentOperator;
	}

	@PutMapping
	ResponseEntity<?> close(Authentication authentication, @PathVariable long venueId,
			@RequestBody SeasonClosureRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		var closure = InvalidApiRequestException.parsing(request::toClosure);
		return switch (closeForSeason.close(operator, new VenueId(venueId), closure)) {
			case CloseOutcome.Closed closed -> ResponseEntity.ok(SeasonClosureResponse.of(closed));
			case CloseOutcome.Rejected rejected -> switch (rejected.reason()) {
				case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_VENUE", "No such venue.");
				case REOPEN_DATE_PASSED -> ApiProblem.response(HttpStatus.UNPROCESSABLE_ENTITY,
						"REOPEN_DATE_PASSED", "The reopen date is not after today.");
			};
		};
	}

	@DeleteMapping
	ResponseEntity<?> reopen(Authentication authentication, @PathVariable long venueId) {
		OperatorId operator = currentOperator.require(authentication);
		return switch (closeForSeason.reopen(operator, new VenueId(venueId))) {
			case REOPENED -> ResponseEntity.noContent().build();
			case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_VENUE", "No such venue.");
		};
	}
}
