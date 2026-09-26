package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentCustomer;
import ai.riviera.platform.shared.ApiProblem;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Signed-in customer account management under {@code /api/me/**}: set/change password, re-request verification.
 * {@link SecurityConfig} gates it to {@code ROLE_CUSTOMER}; the account comes from the session via
 * {@link CurrentCustomer}, never a path id (BOLA-safe). An SSO-only account sets its first password freely — its SSO
 * session proves a provider-verified email — otherwise the current password is required. Never a register-time UPSERT
 * (a takeover vector): a password is set only from the account's own authenticated session.
 */
@RestController
class MyAccountController {

	private static final String SET_PASSWORD_PATH = "/api/me/password";
	private static final String REQUEST_VERIFICATION_PATH = "/api/me/verify-email/request";

	private final CustomerRecovery recovery;
	private final CurrentCustomer currentCustomer;
	private final CustomerAccounts accounts;
	private final PasswordEncoder passwordEncoder;
	private final PrincipalSessionRevoker sessionRevoker;
	private final HttpServletRequest httpRequest;

	MyAccountController(CustomerRecovery recovery, CurrentCustomer currentCustomer,
			CustomerAccounts accounts, PasswordEncoder passwordEncoder,
			PrincipalSessionRevoker sessionRevoker, HttpServletRequest httpRequest) {
		this.recovery = recovery;
		this.currentCustomer = currentCustomer;
		this.accounts = accounts;
		this.passwordEncoder = passwordEncoder;
		this.sessionRevoker = sessionRevoker;
		this.httpRequest = httpRequest;
	}

	/** Wire DTO for setting/changing a password; {@code currentPassword} is required only when one exists. */
	record SetPasswordRequest(String newPassword, String currentPassword) {
		SetPasswordRequest {
			if (newPassword == null || newPassword.isEmpty()) {
				throw new IllegalArgumentException("newPassword is required");
			}
		}
	}

	/**
	 * Set/change the password. The new-password policy outranks a missing current password — the reverse of the operator
	 * twin, forced because presence depends on the account having one. Success effects are ordered, not transactional:
	 * rationale on {@link OperatorAccountController#changePassword}; keep the twins in step.
	 */
	@PostMapping(SET_PASSWORD_PATH)
	ResponseEntity<?> setPassword(@RequestBody SetPasswordRequest request, Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		PasswordPolicy.validate(request.newPassword(), PasswordPolicy.emailLocalPart(authentication.getName()));
		// Empty means no local password (null-hash SSO-only rows are filtered), so neither answer below applies.
		Optional<CustomerAccountCredential> existing = accounts.findByEmail(authentication.getName());
		if (existing.isPresent()) {
			if (!PasswordPolicy.isSupplied(request.currentPassword())) {
				return ApiProblem.response(HttpStatus.BAD_REQUEST, "MISSING_CURRENT_PASSWORD",
						"The request carries no current password.");
			}
			if (!currentPasswordMatches(request, existing.get())) {
				return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_CURRENT_PASSWORD",
						"The current password is incorrect.");
			}
		}
		// Encoded before the revoke: bcrypt costs ~80ms, which would otherwise widen the window below.
		String newPasswordHash = passwordEncoder.encode(request.newPassword());
		// Keep-id read BEFORE the rotation below: after it, no row carries an id this query can match.
		sessionRevoker.revokeAllExcept(authentication.getName(), SessionIdentity.currentId(httpRequest));
		recovery.setPassword(accountId, newPasswordHash);
		SessionIdentity.rotate(httpRequest);
		return ResponseEntity.noContent().build();
	}

	/** Wire DTO for the resend: whether the do-not-mail list withheld the message that was just asked for. */
	record VerificationRequestedView(boolean emailWithheld) {
	}

	/**
	 * Re-send the caller's verification email; always {@code 200} with whether suppression withheld it — safe only because
	 * the endpoint is session-scoped and takes no address. The anonymous forgot-password flow must never branch on
	 * suppression (an enumeration oracle). The suppression read follows the send, so it can never gate it.
	 */
	@PostMapping(REQUEST_VERIFICATION_PATH)
	ResponseEntity<VerificationRequestedView> requestVerification(Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		String email = authentication.getName();
		recovery.sendVerificationEmail(accountId, email);
		return ResponseEntity.ok(new VerificationRequestedView(recovery.isVerificationMailWithheld(email)));
	}

	/** Only reached once the caller supplied a current password — the presence branch above guarantees it. */
	private boolean currentPasswordMatches(SetPasswordRequest request, CustomerAccountCredential credential) {
		return passwordEncoder.matches(request.currentPassword(), credential.passwordHash());
	}
}
