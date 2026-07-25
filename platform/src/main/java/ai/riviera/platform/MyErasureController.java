package ai.riviera.platform;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * Self-service right-to-erasure endpoint (#101 [D5]): a signed-in customer erases their own account +
 * contact PII. Under {@code /api/me/**}, session-principal-scoped (BOLA-safe — no id in the path; the
 * account is resolved from the session via {@link CurrentCustomer}, never a request parameter).
 * Platform-edge machinery (RV-BE-11) — it only reads the security context and revokes sessions; the scrub
 * itself lives in the {@code customer} module behind {@link AccountErasure}.
 *
 * <p>Always {@code 204}: the underlying scrub is idempotent, so a second request (already erased) is still
 * a success. After the erasure commits, every server-side session for the principal is revoked
 * ({@link PrincipalSessionRevoker}) so the tourist is signed out on every device. {@link SecurityConfig}
 * gates this POST to {@code ROLE_CUSTOMER} via the method-agnostic {@code /api/me/**} matcher, which
 * since #317 covers every verb on the surface (it originally needed a dedicated erasure-only rule).
 */
@RestController
class MyErasureController {

	private static final String ERASURE_PATH = "/api/me/erasure";

	private final AccountErasure erasure;
	private final CurrentCustomer currentCustomer;
	private final PrincipalSessionRevoker sessionRevoker;

	MyErasureController(AccountErasure erasure, CurrentCustomer currentCustomer,
			PrincipalSessionRevoker sessionRevoker) {
		this.erasure = erasure;
		this.currentCustomer = currentCustomer;
		this.sessionRevoker = sessionRevoker;
	}

	/** Erase the signed-in customer's account + contact PII, then revoke all their sessions. */
	@PostMapping(ERASURE_PATH)
	ResponseEntity<Void> eraseMyAccount(Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		erasure.eraseAccount(accountId);
		sessionRevoker.revokeAll(authentication.getName());
		return ResponseEntity.noContent().build();
	}
}
