package ai.riviera.platform;

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
import jakarta.servlet.http.HttpSession;

/**
 * The signed-in operator's own credential surface (#326): change your own password, proving the current
 * one. Until this slice an operator had no self-service path at all — {@link OperatorProvisioning#setPassword}
 * existed but its only caller was {@link OperatorCredentialInitializer}, the boot-time runner for the
 * bootstrap admin — so a self-registered operator (S6 #115) that suspected its credential was compromised
 * had to go find a platform admin. Tourists have had the equivalent since S8 ({@link MyAccountController}).
 *
 * <p><strong>Why not under {@code /api/me/**}.</strong> That namespace has been a method-agnostic
 * {@code hasRole(CUSTOMER)} rule since #317, and {@link SecurityConfig} states outright that adding a
 * non-customer endpoint under it makes the rule wrong. This endpoint instead joins the other two
 * operator-credential surfaces ({@code login}, {@code register}) under {@code /api/auth/operator/**},
 * with its own {@code OPERATOR} matcher and its own rate-limit budget.
 *
 * <p><strong>The bootstrap admin is deliberately refused.</strong> Its credential is env-managed:
 * {@link OperatorCredentialInitializer} re-stamps {@code RIVIERA_OPERATOR_PASSWORD} on every boot and reads
 * any difference as a genuine rotation, so a self-service change would be silently reverted at the next
 * deploy — and would revoke the admin's own session on the way. Its rotation path stays "change the
 * variable and restart". The guard keys on {@code riviera.operator.username}, <strong>not</strong> on
 * {@link OperatorCredential#admin()}: a second admin approved through {@code /api/admin/operators} is an
 * admin but is not env-managed, and must keep self-service.
 *
 * <p>Platform-edge machinery (RV-BE-11): the {@code operator} module stores an opaque hash and never
 * encodes, verifies, or invalidates a session — all three happen here.
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
	 * Wire DTO for an operator password change. Both fields are required — unlike the customer DTO, whose
	 * {@code currentPassword} is optional for an SSO-only account, because operators have no SSO (that is
	 * #276) and therefore always have a password to prove. Presence checks live in the compact constructor
	 * (§6b centralized-explicit style) → a malformed body is {@code 400 INVALID_REQUEST}.
	 */
	record ChangePasswordRequest(String currentPassword, String newPassword) {
		ChangePasswordRequest {
			if (currentPassword == null || currentPassword.isEmpty()
					|| newPassword == null || newPassword.isEmpty()) {
				throw new IllegalArgumentException("currentPassword and newPassword are required");
			}
		}
	}

	/**
	 * Change the signed-in operator's own password, then evict every <em>other</em> session the old
	 * credential authorized. A weak new password is {@code 400 INVALID_REQUEST}; a wrong current password
	 * is {@code 400 INVALID_CURRENT_PASSWORD}; the env-managed bootstrap admin is
	 * {@code 409 BOOTSTRAP_CREDENTIAL_MANAGED}; a non-{@code ACTIVE} account is {@code 409 ACCOUNT_NOT_ACTIVE}.
	 */
	@PostMapping(CHANGE_PASSWORD_PATH)
	ResponseEntity<?> changePassword(@RequestBody ChangePasswordRequest request, Authentication authentication) {
		String username = authentication.getName();
		if (bootstrapOperator.username().equals(username)) {
			return ApiProblem.response(HttpStatus.CONFLICT, "BOOTSTRAP_CREDENTIAL_MANAGED",
					"This account's password is managed by the deployment environment and cannot be "
							+ "changed here.");
		}
		CustomerPasswords.validate(request.newPassword());
		Optional<OperatorCredential> existing = accounts.findByUsername(username);
		if (existing.isEmpty() || !currentPasswordMatches(request, existing.get())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_CURRENT_PASSWORD",
					"The current password is incorrect.");
		}
		if (!existing.get().active()) {
			return ApiProblem.response(HttpStatus.CONFLICT, "ACCOUNT_NOT_ACTIVE",
					"This account is not active.");
		}
		provisioning.setPassword(username, passwordEncoder.encode(request.newPassword()));
		// Evict every OTHER session the old credential authorized; this one survives (#128).
		sessionRevoker.revokeAllExcept(username, currentSessionId(httpRequest));
		return ResponseEntity.noContent().build();
	}

	/**
	 * Verify the submitted current password against the <strong>stored hash</strong>. Never encode the
	 * input and compare hashes: bcrypt re-salts, so that comparison is always false and would reject every
	 * correct password. The same defect shipped twice before — #128 rotate-detection and the S8
	 * set-password — which is why it is spelled out here rather than left to the reader.
	 */
	private boolean currentPasswordMatches(ChangePasswordRequest request, OperatorCredential credential) {
		return credential.passwordHash() != null
				&& passwordEncoder.matches(request.currentPassword(), credential.passwordHash());
	}

	private static String currentSessionId(HttpServletRequest request) {
		HttpSession session = request.getSession(false);
		return session != null ? session.getId() : null;
	}
}
