package ai.riviera.platform;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * Self-service right to erasure (ADR-0010): a signed-in customer erases their own account and contact
 * PII. BOLA-safe: no id in the path, the account comes from the session principal via {@link CustomerAccountDirectory};
 * {@link SecurityConfig}'s {@code /api/me/**} matcher gates it to {@code ROLE_CUSTOMER}. The edge only
 * revokes sessions; the scrub is {@code customer}'s, behind {@link AccountErasure}. Always {@code 204},
 * the scrub being idempotent. Every session goes, the calling one included, so no keep-id is passed.
 */
@RestController
class MyErasureController {

	private static final String ERASURE_PATH = "/api/me/erasure";

	private final AccountErasure erasure;
	private final CustomerAccountDirectory customerDirectory;
	private final PrincipalSessionRevoker sessionRevoker;

	MyErasureController(AccountErasure erasure, CustomerAccountDirectory customerDirectory,
			PrincipalSessionRevoker sessionRevoker) {
		this.erasure = erasure;
		this.customerDirectory = customerDirectory;
		this.sessionRevoker = sessionRevoker;
	}

	/**
	 * Erase the signed-in customer's account and PII, {@link PrincipalSessionRevoker#revokeAll} running
	 * before and after the scrub ({@code docs/runbooks/data-erasure.md}): a failed or partial first
	 * revoke leaves the PII intact, so a re-submit revokes what is left and then scrubs.
	 */
	@PostMapping(ERASURE_PATH)
	ResponseEntity<Void> eraseMyAccount(Authentication authentication) {
		CustomerAccountId accountId = customerDirectory.requireSignedInAccount(CustomerPrincipal.name(authentication),
				CustomerPrincipal.isCustomer(authentication));
		String principal = authentication.getName();
		sessionRevoker.revokeAll(principal);
		erasure.eraseAccount(accountId);
		sessionRevoker.revokeAll(principal);
		return ResponseEntity.noContent().build();
	}
}
