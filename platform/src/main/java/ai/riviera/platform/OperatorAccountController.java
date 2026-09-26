package ai.riviera.platform;

import ai.riviera.platform.shared.ApiProblem;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import jakarta.servlet.http.HttpServletRequest;

/**
 * The signed-in operator's own credential surface: change your own password, proving the current one
 * (tourist twin: {@link MyAccountController}). Lives under {@code /api/auth/operator/**} with its own rate
 * budget, never under {@link SecurityConfig}'s customer-only {@code /api/me/**} rule. The env-managed
 * bootstrap admin is refused, keyed on {@code riviera.operator.username}, <strong>not</strong>
 * {@link OperatorCredential#admin()}: an approved second admin keeps self-service. Hashing, verifying and
 * session revocation stay at this edge (RV-BE-11). Rationale: docs/runbooks/operator-credential-provisioning.md.
 */
@RestController
class OperatorAccountController {

	private static final String CHANGE_PASSWORD_PATH = "/api/auth/operator/password";

	private final OperatorAccounts accounts;
	private final OperatorProvisioning provisioning;
	private final PasswordEncoder passwordEncoder;
	private final PrincipalSessionRevoker sessionRevoker;
	private final RivieraOperatorProperties bootstrapOperator;
	private final HttpServletRequest httpRequest;

	OperatorAccountController(OperatorAccounts accounts, OperatorProvisioning provisioning,
			PasswordEncoder passwordEncoder, PrincipalSessionRevoker sessionRevoker,
			RivieraOperatorProperties bootstrapOperator, HttpServletRequest httpRequest) {
		this.accounts = accounts;
		this.provisioning = provisioning;
		this.passwordEncoder = passwordEncoder;
		this.sessionRevoker = sessionRevoker;
		this.bootstrapOperator = bootstrapOperator;
		this.httpRequest = httpRequest;
	}

	/**
	 * Wire DTO for an operator password change. Only {@code newPassword} is enforced here (absent or empty →
	 * {@code 400 INVALID_REQUEST}); a missing {@code currentPassword} is a different fault that
	 * {@link #changePassword} answers with its own code — checking it here would collapse the two codes.
	 */
	record ChangePasswordRequest(String currentPassword, String newPassword) {
		ChangePasswordRequest {
			if (newPassword == null || newPassword.isEmpty()) {
				throw new IllegalArgumentException("newPassword is required");
			}
		}
	}

	/**
	 * Revoke every <em>other</em> session, write the new hash, rotate this session's id — ordered, not
	 * transactional (no shared transaction exists): revoke first so its failure leaves the password unchanged,
	 * accepting a one-UPDATE old-password sign-in window. Codes: docs/runbooks/operator-credential-provisioning.md.
	 */
	@PostMapping(CHANGE_PASSWORD_PATH)
	ResponseEntity<?> changePassword(@RequestBody ChangePasswordRequest request, Authentication authentication) {
		String username = authentication.getName();
		if (bootstrapOperator.username().equals(username)) {
			return ApiProblem.response(HttpStatus.CONFLICT, "BOOTSTRAP_CREDENTIAL_MANAGED",
					"This account's password is managed by the deployment environment and cannot be "
							+ "changed here.");
		}
		if (!PasswordPolicy.isSupplied(request.currentPassword())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "MISSING_CURRENT_PASSWORD",
					"The request carries no current password.");
		}
		PasswordPolicy.validate(request.newPassword(), username);
		Optional<OperatorCredential> existing = accounts.findByUsername(username);
		if (existing.isEmpty() || !currentPasswordMatches(request, existing.get())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_CURRENT_PASSWORD",
					"The current password is incorrect.");
		}
		// The login set: whoever may hold a session may rotate its own credential; others are refused.
		if (!OperatorUserDetailsService.MAY_AUTHENTICATE.contains(existing.get().status())) {
			return ApiProblem.response(HttpStatus.CONFLICT, "ACCOUNT_NOT_ACTIVE",
					"This account is not active.");
		}
		// Encoded before the revoke: bcrypt costs ~80ms, which would otherwise widen the window below.
		String newPasswordHash = passwordEncoder.encode(request.newPassword());
		// Keep-id read BEFORE the rotation below: after it, no row carries an id this query can match.
		sessionRevoker.revokeAllExcept(username, SessionIdentity.currentId(httpRequest));
		provisioning.setPassword(username, newPasswordHash);
		SessionIdentity.rotate(httpRequest);
		return ResponseEntity.noContent().build();
	}

	/**
	 * Verify the submitted password against the <strong>stored hash</strong>. Never encode the input and
	 * compare hashes: bcrypt re-salts, so that is always false and rejects every correct password (a defect
	 * that has shipped twice).
	 */
	private boolean currentPasswordMatches(ChangePasswordRequest request, OperatorCredential credential) {
		return credential.passwordHash() != null
				&& passwordEncoder.matches(request.currentPassword(), credential.passwordHash());
	}
}
