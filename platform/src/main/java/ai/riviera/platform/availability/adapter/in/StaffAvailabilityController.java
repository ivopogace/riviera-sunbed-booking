package ai.riviera.platform.availability.adapter.in;

import java.time.LocalDate;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.ApiProblem;
import ai.riviera.platform.CurrentOperator;
import ai.riviera.platform.availability.application.StaffAvailability;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Operator write endpoints for staff tap-to-mark walk-ins (U8, issue #10) — the availability
 * module's first driving (REST) adapter, depending on its own {@link StaffAvailability} port
 * (invariant #11) plus the edge {@link CurrentOperator} resolver. An authenticated operator surface
 * (httpBasic, role {@code OPERATOR}, configured in {@code SecurityConfig}), mirroring the U7 write
 * posture.
 *
 * <p>Outcomes map to HTTP via exhaustive {@code switch}: mark MARKED→200, ALREADY_TAKEN→409,
 * NO_SUCH_SET→404, DATE_IN_PAST→422; release RELEASED→204, NOT_MARKED→409. The {@code venueId} path
 * segment keeps the URL consistent with the U7 set paths ({@code /api/venues/{id}/sets/{id}}) but is
 * <strong>not</strong> the authorization key: the owning venue is derived from the {@code setId}
 * inside the service (invariant #13, issue #73), and a mismatch is {@code 403} via
 * {@code ApiErrorHandler}. The controller resolves the authenticated operator and
 * passes it through. Errors are RFC-7807 problem bodies built by {@link ApiProblem} (issue #97).
 */
@RestController
@RequestMapping("/api/venues")
class StaffAvailabilityController {

	private final StaffAvailability staff;
	private final CurrentOperator currentOperator;

	StaffAvailabilityController(StaffAvailability staff, CurrentOperator currentOperator) {
		this.staff = staff;
		this.currentOperator = currentOperator;
	}

	@PostMapping("/{venueId}/sets/{setId}/availability")
	ResponseEntity<Object> mark(Authentication authentication, @PathVariable long venueId,
			@PathVariable long setId, @RequestBody(required = false) MarkRequest request) {
		if (request == null || request.date() == null) {
			return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "A date is required.");
		}
		OperatorId operator = currentOperator.require(authentication);
		return switch (staff.mark(operator, new SetId(setId), request.date())) {
			case MARKED -> ResponseEntity.ok(Map.of("state", "STAFF_MARKED"));
			case ALREADY_TAKEN -> error(HttpStatus.CONFLICT, "ALREADY_TAKEN",
					"The set is already taken for this date.");
			case NO_SUCH_SET -> error(HttpStatus.NOT_FOUND, "NO_SUCH_SET", "No such set.");
			case DATE_IN_PAST -> error(HttpStatus.UNPROCESSABLE_ENTITY, "DATE_IN_PAST",
					"The date is in the past.");
		};
	}

	@DeleteMapping("/{venueId}/sets/{setId}/availability")
	ResponseEntity<Object> release(Authentication authentication,
			@PathVariable long venueId, @PathVariable long setId,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = currentOperator.require(authentication);
		return switch (staff.release(operator, new SetId(setId), date)) {
			case RELEASED -> ResponseEntity.noContent().build();
			case NOT_MARKED -> error(HttpStatus.CONFLICT, "NOT_MARKED",
					"Nothing is staff-marked for this set and date.");
		};
	}

	private static ResponseEntity<Object> error(HttpStatus status, String code, String detail) {
		return ResponseEntity.status(status).body(ApiProblem.of(status, code, detail));
	}
}
