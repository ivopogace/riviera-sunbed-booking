package ai.riviera.platform.auth.adapter.in;

import ai.riviera.platform.shared.ApiProblem;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.auth.api.SessionRevocation;
import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.vocabulary.Emails;

/**
 * The platform-admin erasure of a data subject by email (ADR-0010), for a guest with no account or an account
 * holder who cannot self-serve; the scrub is {@code customer}'s, behind {@link AccountErasure}. {@code ADMIN}-gated
 * in {@code SecurityConfig}, exempt from #13. Always {@code 204}, never revealing whether the email existed
 * (design D-8); a blank email is {@code 400 INVALID_REQUEST}. Sessions are revoked as on the self-service path,
 * under the canonical email that names every customer principal. Rationale: RESPONSIBILITIES.md §{@code auth}.
 */
@RestController
@RequestMapping("/api/admin")
class AdminErasureController {

	private final AccountErasure erasure;
	private final SessionRevocation sessionRevoker;

	AdminErasureController(AccountErasure erasure, SessionRevocation sessionRevoker) {
		this.erasure = erasure;
		this.sessionRevoker = sessionRevoker;
	}

	/** Wire DTO for a data-subject erasure request. */
	record EraseRequest(String email) {
	}

	/** Erase the subject, {@link SessionRevocation#revokeAll} running before and after the scrub. */
	@PostMapping("/erasure")
	ResponseEntity<?> erase(@RequestBody EraseRequest request) {
		if (request.email() == null || request.email().isBlank()) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "An email is required.");
		}
		String principal = Emails.normalize(request.email());
		sessionRevoker.revokeAll(principal);
		erasure.eraseByEmail(request.email());
		sessionRevoker.revokeAll(principal);
		return ResponseEntity.noContent().build();
	}
}
