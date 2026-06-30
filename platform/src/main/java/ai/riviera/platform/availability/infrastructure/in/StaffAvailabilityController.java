package ai.riviera.platform.availability.infrastructure.in;

import java.time.LocalDate;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.availability.application.in.StaffAvailability;
import ai.riviera.platform.venue.api.SetId;

/**
 * Operator write endpoints for staff tap-to-mark walk-ins (U8, issue #10) — the availability
 * module's first driving (REST) adapter, depending only on its own {@link StaffAvailability} port
 * (invariant #11). An authenticated operator surface (httpBasic, role {@code OPERATOR}, configured
 * in {@code SecurityConfig}), mirroring the U7 write posture.
 *
 * <p>Outcomes map to HTTP via exhaustive {@code switch}: mark MARKED→200, ALREADY_TAKEN→409,
 * NO_SUCH_SET→404, DATE_IN_PAST→422; release RELEASED→204, NOT_MARKED→409. The {@code venueId} path
 * segment keeps the URL consistent with the U7 set paths ({@code /api/venues/{id}/sets/{id}}); the
 * set id is the actual key (globally unique), so it is not an authorization check here (the single
 * configured operator is trusted — real per-venue staff identity is deferred).
 */
@RestController
@RequestMapping("/api/venues")
class StaffAvailabilityController {

	/** JSON body key for an error-code payload ({@code {"error": CODE}}), matching the U7 shape. */
	private static final String ERROR_KEY = "error";

	private final StaffAvailability staff;

	StaffAvailabilityController(StaffAvailability staff) {
		this.staff = staff;
	}

	@PostMapping("/{venueId}/sets/{setId}/availability")
	ResponseEntity<Map<String, String>> mark(@PathVariable long venueId, @PathVariable long setId,
			@RequestBody(required = false) MarkRequest request) {
		if (request == null || request.date() == null) {
			return ResponseEntity.badRequest().body(Map.of(ERROR_KEY, "INVALID_REQUEST"));
		}
		return switch (staff.mark(new SetId(setId), request.date())) {
			case MARKED -> ResponseEntity.ok(Map.of("state", "STAFF_MARKED"));
			case ALREADY_TAKEN -> error(HttpStatus.CONFLICT, "ALREADY_TAKEN");
			case NO_SUCH_SET -> error(HttpStatus.NOT_FOUND, "NO_SUCH_SET");
			case DATE_IN_PAST -> error(HttpStatus.UNPROCESSABLE_ENTITY, "DATE_IN_PAST");
		};
	}

	@DeleteMapping("/{venueId}/sets/{setId}/availability")
	ResponseEntity<Map<String, String>> release(@PathVariable long venueId, @PathVariable long setId,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return switch (staff.release(new SetId(setId), date)) {
			case RELEASED -> ResponseEntity.noContent().build();
			case NOT_MARKED -> error(HttpStatus.CONFLICT, "NOT_MARKED");
		};
	}

	private static ResponseEntity<Map<String, String>> error(HttpStatus status, String code) {
		return ResponseEntity.status(status).body(Map.of(ERROR_KEY, code));
	}
}
