package ai.riviera.platform.venue.adapter.in;

import java.net.URI;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.ApiProblem;
import ai.riviera.platform.CurrentOperator;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.application.AddSetOutcome;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.EditVenueProfile;
import ai.riviera.platform.venue.application.OnboardVenue;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;
import ai.riviera.platform.venue.application.ReplaceRejection;
import ai.riviera.platform.venue.application.SetRejection;

/**
 * Operator write endpoints for venue onboarding + beach-map editing (U7, issue #7). Driving
 * adapter — depends only on the {@code venue} module's {@link OnboardVenue} / {@link EditBeachMap}
 * ports (invariant #11) plus the edge {@link CurrentOperator} resolver. These are an authenticated
 * operator surface (session cookie, role {@code OPERATOR}, configured in {@code SecurityConfig}); the
 * public U1 read endpoint is a separate controller. Outcomes map to HTTP via exhaustive
 * {@code switch}: created→201 (+Location), applied→204, {@code NO_SUCH_*}→404,
 * {@code CELL_TAKEN}/{@code DUPLICATE_POSITION}→409; malformed→400 and the
 * constraint-race backstop ({@code DataIntegrityViolationException}→409 {@code CONFLICT},
 * invariant #12) map centrally in {@code ApiErrorHandler}. Errors are RFC-7807
 * {@link ProblemDetail} built by {@link ApiProblem} (issue #97).
 *
 * <p>The per-set edits and the profile edit ({@code PATCH /api/venues/{venueId}} — amenities +
 * distance-to-water, T7 #140) are venue-scoped: the controller resolves the authenticated principal
 * to an {@link OperatorId} and hands it to {@link EditBeachMap} / {@link EditVenueProfile}, which
 * asserts ownership of {@code venueId} before acting (invariant #13); a mismatch is {@code 403} via
 * {@code ApiErrorHandler}. {@code create} takes no {@code venueId} and stays role-gated only.
 */
@RestController
@RequestMapping("/api/venues")
class VenueAdminController {

	private final OnboardVenue onboardVenue;
	private final EditBeachMap editBeachMap;
	private final EditVenueProfile editVenueProfile;
	private final CurrentOperator currentOperator;

	VenueAdminController(OnboardVenue onboardVenue, EditBeachMap editBeachMap,
			EditVenueProfile editVenueProfile, CurrentOperator currentOperator) {
		this.onboardVenue = onboardVenue;
		this.editBeachMap = editBeachMap;
		this.editVenueProfile = editVenueProfile;
		this.currentOperator = currentOperator;
	}

	@PostMapping
	ResponseEntity<Map<String, Object>> create(@RequestBody CreateVenueRequest request) {
		VenueId id = onboardVenue.onboard(request.toCommand());
		return ResponseEntity.created(URI.create("/api/venues/" + id.value()))
				.body(Map.of("id", id.value()));
	}

	@PatchMapping("/{venueId}")
	ResponseEntity<?> updateProfile(Authentication authentication, @PathVariable long venueId,
			@RequestBody UpdateVenueProfileRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		return toResponse(editVenueProfile.updateProfile(operator, new VenueId(venueId),
				request.toCommand()));
	}

	@PostMapping("/{venueId}/sets")
	ResponseEntity<?> addSet(Authentication authentication, @PathVariable long venueId,
			@RequestBody SetPositionRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		return switch (editBeachMap.addSet(operator, new VenueId(venueId), request.toCommand())) {
			case AddSetOutcome.Added added -> ResponseEntity
					.created(URI.create("/api/venues/" + venueId + "/sets/" + added.setId().value()))
					.body(Map.of("id", added.setId().value()));
			case AddSetOutcome.Rejected rejected -> error(rejected.reason());
		};
	}

	@PatchMapping("/{venueId}/sets/{setId}")
	ResponseEntity<?> editSet(Authentication authentication, @PathVariable long venueId,
			@PathVariable long setId, @RequestBody SetPositionRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		return toResponse(editBeachMap.editSet(operator, new VenueId(venueId), new SetId(setId),
				request.toCommand()));
	}

	@DeleteMapping("/{venueId}/sets/{setId}")
	ResponseEntity<?> removeSet(Authentication authentication, @PathVariable long venueId,
			@PathVariable long setId) {
		OperatorId operator = currentOperator.require(authentication);
		return toResponse(editBeachMap.removeSet(operator, new VenueId(venueId), new SetId(setId)));
	}

	@PutMapping("/{venueId}/beach-map")
	ResponseEntity<?> replaceLayout(Authentication authentication, @PathVariable long venueId,
			@RequestBody BeachMapLayoutRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		return switch (editBeachMap.replaceLayout(operator, new VenueId(venueId), request.toCommand())) {
			case ReplaceLayoutOutcome.Replaced ignored -> ResponseEntity.noContent().build();
			case ReplaceLayoutOutcome.Rejected rejected -> error(rejected.reason());
		};
	}

	@PutMapping("/{venueId}/rows/{rowLabel}/price")
	ResponseEntity<?> repriceRow(Authentication authentication, @PathVariable long venueId,
			@PathVariable String rowLabel, @RequestBody RowPriceRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		return toResponse(editBeachMap.repriceRow(operator, new VenueId(venueId),
				request.toCommand(rowLabel)));
	}

	private static ResponseEntity<?> toResponse(ChangeOutcome outcome) {
		return switch (outcome) {
			case ChangeOutcome.Applied ignored -> ResponseEntity.noContent().build();
			case ChangeOutcome.Rejected rejected -> error(rejected.reason());
		};
	}

	private static ResponseEntity<ProblemDetail> error(SetRejection reason) {
		return switch (reason) {
			case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(),
					"No such venue.");
			case NO_SUCH_SET -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(),
					"No such set.");
			case NO_SUCH_ROW -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(),
					"No set on this venue has that row label.");
			case CELL_TAKEN -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Another set already occupies this grid cell.");
			case DUPLICATE_POSITION -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Another set already has this row and position.");
		};
	}

	private static ResponseEntity<ProblemDetail> error(ReplaceRejection reason) {
		return switch (reason) {
			case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(),
					"No such venue.");
			case LAYOUT_IN_USE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"This venue has bookings or walk-in holds, so its layout is locked.");
			case CELL_TAKEN -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Two sets occupy the same grid cell.");
			case DUPLICATE_POSITION -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Two sets share the same row and position.");
			case EMPTY_LAYOUT -> ApiProblem.response(HttpStatus.BAD_REQUEST, reason.name(),
					"A layout must have at least one set.");
			case LAYOUT_TOO_LARGE -> ApiProblem.response(HttpStatus.BAD_REQUEST, reason.name(),
					"The layout exceeds the maximum grid size.");
		};
	}
}
