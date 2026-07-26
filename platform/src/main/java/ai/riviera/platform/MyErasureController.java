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
 * a success. Every server-side session for the principal is revoked ({@link PrincipalSessionRevoker}) so the
 * tourist is signed out on every device — including the calling one, which is why no keep-id is passed.
 * {@link SecurityConfig}
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

	/**
	 * Erase the signed-in customer's account + contact PII, with the session revoke <strong>bracketing</strong>
	 * the scrub (#357).
	 *
	 * <p><strong>Before</strong>, because the two effects are not atomic and never can be — the scrub belongs
	 * to the {@code customer} module's transaction, the session deletes to Spring Session's repository, so a
	 * {@code @Transactional} here would look atomic without being atomic (#344 D-1). Ordered the other way, a
	 * transient revoke failure raised {@code 500} <em>after</em> the PII was gone: the tourist is told the
	 * erasure failed, their sessions are still alive on an erased account, and no retry restores either.
	 * Revoking first leaves the PII intact however the revoke fails — including <em>partway</em>, since
	 * {@link PrincipalSessionRevoker} deletes session by session rather than in one transaction — and every
	 * one of those states is recoverable: re-submitting revokes whatever is left, then scrubs.
	 *
	 * <p><strong>And after</strong>, because revoking only first would open a window in which the credential
	 * still works: a sign-in landing between the revoke and the scrub would produce a session that outlives
	 * the erasure. The trailing revoke this endpoint already had closes it, so it stays. What no ordering can
	 * remove is a failure in <em>that</em> revoke — it still reports an error with the account already
	 * erased, though by then every session that existed when the request started is gone.
	 */
	@PostMapping(ERASURE_PATH)
	ResponseEntity<Void> eraseMyAccount(Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		String principal = authentication.getName();
		sessionRevoker.revokeAll(principal);
		erasure.eraseAccount(accountId);
		sessionRevoker.revokeAll(principal);
		return ResponseEntity.noContent().build();
	}
}
