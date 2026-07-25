package ai.riviera.platform;

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
import jakarta.servlet.http.HttpSession;

/**
 * Authenticated customer account-management endpoints (S8, epic #108): set/change the signed-in
 * customer's password, and re-request a verification email. Under {@code /api/me/**}, so
 * {@link SecurityConfig} already gates them to {@code ROLE_CUSTOMER}, session-principal-scoped (BOLA-safe
 * — no id in the path; the account is resolved from the session via {@link CurrentCustomer}). Platform-edge
 * machinery (RV-BE-11).
 *
 * <p><strong>Set password (closes S4 F-1):</strong> an SSO-only account (no local password) sets its
 * first password freely — its SSO session is proof of a provider-verified email — while an account that
 * already has a password must supply the correct current one. Never a register-time UPSERT (a takeover
 * vector); the password is set only from within the account's own authenticated session.
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
	 * Set or change the signed-in customer's password. SSO-only accounts (no stored credential) set their
	 * first password with no current-password check (F-1); accounts that already have one must supply the
	 * matching current password (else {@code 400 INVALID_CURRENT_PASSWORD}). A weak new password is
	 * {@code 400 INVALID_REQUEST}.
	 */
	@PostMapping(SET_PASSWORD_PATH)
	ResponseEntity<?> setPassword(@RequestBody SetPasswordRequest request, Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		CustomerPasswords.validate(request.newPassword());
		Optional<CustomerAccountCredential> existing = accounts.findByEmail(authentication.getName());
		if (existing.isPresent() && !currentPasswordMatches(request, existing.get())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_CURRENT_PASSWORD",
					"The current password is incorrect.");
		}
		recovery.setPassword(accountId, passwordEncoder.encode(request.newPassword()));
		// Evict every OTHER session the old credential authorized; this one survives (#128).
		sessionRevoker.revokeAllExcept(authentication.getName(), currentSessionId(httpRequest));
		return ResponseEntity.noContent().build();
	}

	private static String currentSessionId(HttpServletRequest request) {
		HttpSession session = request.getSession(false);
		return session != null ? session.getId() : null;
	}

	/** Re-issue a verification email to the signed-in customer's own address. Always {@code 204}. */
	@PostMapping(REQUEST_VERIFICATION_PATH)
	ResponseEntity<Void> requestVerification(Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		recovery.sendVerificationEmail(accountId, authentication.getName());
		return ResponseEntity.noContent().build();
	}

	private boolean currentPasswordMatches(SetPasswordRequest request, CustomerAccountCredential credential) {
		return request.currentPassword() != null
				&& passwordEncoder.matches(request.currentPassword(), credential.passwordHash());
	}
}
