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
 * The platform-admin surface for actioning a data-subject erasure request by email — for a guest
 * with no account, or an account holder who cannot self-serve. Drives only {@code customer}'s
 * {@link AccountErasure} port (invariant #11); the scrub lives in the customer application service.
 * Gated to {@code ADMIN} in {@link SecurityConfig}, not venue-scoped (exempt from #13); any other
 * role is {@code 403}. Erased, already-erased and nothing-to-erase are all {@code 204}, never
 * revealing whether the email existed (design D-8); a blank email is {@code 400 INVALID_REQUEST}.
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
