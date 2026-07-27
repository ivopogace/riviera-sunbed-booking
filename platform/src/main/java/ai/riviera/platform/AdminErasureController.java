package ai.riviera.platform;

import ai.riviera.platform.shared.ApiProblem;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.customer.api.AccountErasure;

/**
 * The platform-admin surface for actioning a data-subject erasure request by email (#101 [D5]) — for a
 * guest with no account, or an account holder who cannot self-serve. Driving adapter depending only on the
 * {@code customer} module's {@link AccountErasure} port (invariant #11); the scrub lives in the customer
 * application service.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> Lives under {@code /api/admin/**}, gated to the
 * {@code ADMIN} role in {@link SecurityConfig} — a platform-wide admin action, exempt from the per-venue
 * authorization of invariant #13. A plain {@code OPERATOR} or {@code CUSTOMER} reaching it is {@code 403}.
 * A successful (or already-erased, or nothing-to-erase) request is {@code 204} — non-enumerating, so it
 * never reveals whether the email existed (design D-8); a blank email is a {@code 400 INVALID_REQUEST}
 * built by the one RFC-7807 {@link ApiProblem} factory (issue #97).
 */
@RestController
@RequestMapping("/api/admin")
class AdminErasureController {

	private final AccountErasure erasure;

	AdminErasureController(AccountErasure erasure) {
		this.erasure = erasure;
	}

	/** Wire DTO for a data-subject erasure request. */
	record EraseRequest(String email) {
	}

	@PostMapping("/erasure")
	ResponseEntity<?> erase(@RequestBody EraseRequest request) {
		if (request.email() == null || request.email().isBlank()) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "An email is required.");
		}
		erasure.eraseByEmail(request.email());
		return ResponseEntity.noContent().build();
	}
}
