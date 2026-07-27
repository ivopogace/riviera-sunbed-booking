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

/**
 * Authenticated customer account-management endpoints (S8, epic #108): set/change the signed-in
 * customer's password, and re-request a verification email. Under {@code /api/me/**}, which
 * {@link SecurityConfig}'s method-agnostic matcher gates to {@code ROLE_CUSTOMER} at the filter layer
 * (#317 — until then these two POSTs fell through to {@code anyRequest().authenticated()} and were held
 * only by {@link CurrentCustomer#require} below), session-principal-scoped (BOLA-safe
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
	 * matching current password — omitted is {@code 400 MISSING_CURRENT_PASSWORD}, supplied-but-wrong is
	 * {@code 400 INVALID_CURRENT_PASSWORD} (#345: one code for both told a caller a password it never sent
	 * was incorrect; the operator twin split the same conflation out of {@code INVALID_REQUEST}). A weak new
	 * password is {@code 400 INVALID_REQUEST}.
	 *
	 * <p>The success-path effects are <strong>ordered, not transactional</strong> (#344) — encode, revoke,
	 * write, rotate. {@link OperatorAccountController#changePassword} carries the full rationale, including
	 * what the ordering does <em>not</em> buy; this is its customer twin and must not drift from it. In
	 * short: revoking first means a <em>revoke</em> failure leaves the password unchanged, so the customer's
	 * natural retry works, and rotating the surviving session id last — after the revoke has been handed the
	 * pre-rotation id — retires the cookie value that proved the old credential.
	 */
	@PostMapping(SET_PASSWORD_PATH)
	ResponseEntity<?> setPassword(@RequestBody SetPasswordRequest request, Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		CustomerPasswords.validate(request.newPassword());
		// Empty means "no local password" (findByEmail filters null-hash SSO-only rows), so both current-password
		// answers below are nested here: an SSO-only account must keep reaching neither of them.
		Optional<CustomerAccountCredential> existing = accounts.findByEmail(authentication.getName());
		if (existing.isPresent()) {
			if (!CustomerPasswords.isSupplied(request.currentPassword())) {
				return ApiProblem.response(HttpStatus.BAD_REQUEST, "MISSING_CURRENT_PASSWORD",
						"Enter your current password.");
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

	/** Re-issue a verification email to the signed-in customer's own address. Always {@code 204}. */
	@PostMapping(REQUEST_VERIFICATION_PATH)
	ResponseEntity<Void> requestVerification(Authentication authentication) {
		CustomerAccountId accountId = currentCustomer.require(authentication);
		recovery.sendVerificationEmail(accountId, authentication.getName());
		return ResponseEntity.noContent().build();
	}

	/** Only reached once the caller supplied a current password — the presence branch above guarantees it. */
	private boolean currentPasswordMatches(SetPasswordRequest request, CustomerAccountCredential credential) {
		return passwordEncoder.matches(request.currentPassword(), credential.passwordHash());
	}
}
