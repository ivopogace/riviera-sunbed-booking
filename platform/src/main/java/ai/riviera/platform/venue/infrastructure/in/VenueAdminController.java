package ai.riviera.platform.venue.infrastructure.in;

import java.net.URI;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.CurrentOperator;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.application.in.AddSetOutcome;
import ai.riviera.platform.venue.application.in.ChangeOutcome;
import ai.riviera.platform.venue.application.in.EditBeachMap;
import ai.riviera.platform.venue.application.in.OnboardVenue;
import ai.riviera.platform.venue.application.in.SetRejection;

/**
 * Operator write endpoints for venue onboarding + beach-map editing (U7, issue #7). Driving
 * adapter — depends only on the {@code venue} module's {@link OnboardVenue} / {@link EditBeachMap}
 * ports (invariant #11) plus the edge {@link CurrentOperator} resolver. These are an authenticated
 * operator surface (httpBasic, role {@code OPERATOR}, configured in {@code SecurityConfig}); the
 * public U1 read endpoint is a separate controller. Outcomes map to HTTP via exhaustive
 * {@code switch}: created→201 (+Location), applied→204, {@code NO_SUCH_*}→404,
 * {@code CELL_TAKEN}/{@code DUPLICATE_POSITION}→409, malformed→400.
 *
 * <p>The per-set edits are venue-scoped: the controller resolves the authenticated principal to an
 * {@link OperatorId} and hands it to {@link EditBeachMap}, which asserts ownership of {@code venueId}
 * before acting (invariant #13); a mismatch is {@code 403} via {@code VenueAuthorizationExceptionHandler}.
 * {@code create} takes no {@code venueId} and stays role-gated only.
 */
@RestController
@RequestMapping("/api/venues")
class VenueAdminController {

	/** JSON body key for an error-code payload ({@code {"error": CODE}}). */
	private static final String ERROR_KEY = "error";

	private final OnboardVenue onboardVenue;
	private final EditBeachMap editBeachMap;
	private final CurrentOperator currentOperator;

	VenueAdminController(OnboardVenue onboardVenue, EditBeachMap editBeachMap,
			CurrentOperator currentOperator) {
		this.onboardVenue = onboardVenue;
		this.editBeachMap = editBeachMap;
		this.currentOperator = currentOperator;
	}

	@PostMapping
	ResponseEntity<Map<String, Object>> create(@RequestBody CreateVenueRequest request) {
		VenueId id = onboardVenue.onboard(request.toCommand());
		return ResponseEntity.created(URI.create("/api/venues/" + id.value()))
				.body(Map.of("id", id.value()));
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

	private static ResponseEntity<?> toResponse(ChangeOutcome outcome) {
		return switch (outcome) {
			case ChangeOutcome.Applied ignored -> ResponseEntity.noContent().build();
			case ChangeOutcome.Rejected rejected -> error(rejected.reason());
		};
	}

	private static ResponseEntity<Map<String, String>> error(SetRejection reason) {
		HttpStatus status = switch (reason) {
			case NO_SUCH_VENUE, NO_SUCH_SET -> HttpStatus.NOT_FOUND;
			case CELL_TAKEN, DUPLICATE_POSITION -> HttpStatus.CONFLICT;
		};
		return ResponseEntity.status(status).body(Map.of(ERROR_KEY, reason.name()));
	}

	/** Malformed request body (missing/invalid fields, bad time, non-ISO currency) → 400. */
	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<Map<String, String>> onInvalidRequest(IllegalArgumentException e) {
		return ResponseEntity.badRequest().body(Map.of(ERROR_KEY, "INVALID_REQUEST"));
	}

	/**
	 * Race backstop: a concurrent writer slipped a duplicate cell/position past the pre-check and
	 * the DB UNIQUE constraint (V2/V12) rejected it. Surface as {@code 409}, not {@code 500} — the
	 * constraint, not the pre-check, is the correctness guarantee (invariant #12).
	 */
	@ExceptionHandler(DataIntegrityViolationException.class)
	ResponseEntity<Map<String, String>> onConstraintViolation(DataIntegrityViolationException e) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(ERROR_KEY, "LAYOUT_CONFLICT"));
	}
}
