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
	 * Change the signed-in operator's own password, evicting every <em>other</em> session the old credential
	 * authorized and retiring the calling session's id. A weak new password is {@code 400 INVALID_REQUEST};
	 * a wrong current password is {@code 400 INVALID_CURRENT_PASSWORD}; the env-managed bootstrap admin is
	 * {@code 409 BOOTSTRAP_CREDENTIAL_MANAGED}; a non-{@code ACTIVE} account is {@code 409 ACCOUNT_NOT_ACTIVE}.
	 *
	 * <p><strong>The three success-path effects are ordered, not transactional</strong> (#344). The credential
	 * write and the session deletes belong to different owners — a module's own transaction and Spring
	 * Session's repository — so a {@code @Transactional} here would look atomic without being atomic, and
	 * would push the edge's transaction boundary into module internals (RV-BE-11). Ordering achieves the
	 * property that was actually wanted, and achieves it whatever those boundaries turn out to be: a
	 * <strong>revoke</strong> failure — the transient class this fixes — now leaves either nothing done, or
	 * other sessions signed out with the password unchanged, and the operator's natural retry recovers from
	 * both. Written the other way round (as #326 shipped it) that same failure raised {@code 500}
	 * <em>after</em> the hash had rotated, so the retry drew {@code INVALID_CURRENT_PASSWORD} and the other
	 * device stayed live.
	 *
	 * <p><strong>What the ordering does not buy.</strong> A failure <em>after</em> the write still reports an
	 * error with the password already changed — including Spring Session's save of the rotated id, which runs
	 * in the filter after this method returns and so is outside any ordering decided here. Only a shared
	 * transaction could close that, and there is none to share; the runbook therefore tells an operator to
	 * try the NEW password before concluding a failed change was lost.
	 *
	 * <p><strong>The residual race.</strong> Between the revoke and the write, someone already holding the
	 * old password could sign in and keep that session. The window is one credential UPDATE — the bcrypt
	 * encode is hoisted above the revoke deliberately, since at ~80ms it would otherwise dominate it. That
	 * is accepted as strictly smaller than the defect it replaces: a permanently un-revoked session paired
	 * with an error message saying nothing happened.
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
		// Encoded before the revoke: bcrypt costs ~80ms, which would otherwise widen the window below.
		String newPasswordHash = passwordEncoder.encode(request.newPassword());
		// Keep-id read BEFORE the rotation below: until the filter commits, the session row still carries it.
		sessionRevoker.revokeAllExcept(username, SessionIdentity.currentId(httpRequest));
		provisioning.setPassword(username, newPasswordHash);
		SessionIdentity.rotate(httpRequest);
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
}
