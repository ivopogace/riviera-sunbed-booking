package ai.riviera.platform;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

/**
 * Public customer account-recovery endpoints (S8, epic #108, design D-6/D-8): request a password reset,
 * redeem a reset token, and redeem an email-verification token. Anonymous by definition (the token is
 * the bearer credential, invariant #7) — permitted in {@link SecurityConfig} and behind the
 * {@code RateLimitFilter} recovery budget. Platform-edge login machinery (RV-BE-11): the {@code customer}
 * module only stores the opaque token digest and flips state via its {@code api/} port.
 *
 * <p><strong>Non-enumeration (D-8):</strong> {@code forgot-password} returns the SAME {@code 204} whether
 * or not the email has an account; invalid, expired, and already-used tokens all return the same generic
 * {@code 400 INVALID_OR_EXPIRED_TOKEN}. Every 4xx rides the centralized RFC-7807 contract (#97).
 */
@RestController
class AccountRecoveryController {

	private static final String FORGOT_PASSWORD_PATH = "/api/auth/customer/forgot-password";
	private static final String RESET_PASSWORD_PATH = "/api/auth/customer/reset-password";
	private static final String VERIFY_EMAIL_PATH = "/api/auth/customer/verify-email";
	private static final String INVALID_TOKEN_CODE = "INVALID_OR_EXPIRED_TOKEN";
	private static final String INVALID_TOKEN_DETAIL = "The link is invalid or has expired.";

	private final CustomerRecovery recovery;
	private final CustomerAccountDirectory directory;
	private final PasswordEncoder passwordEncoder;
	private final PrincipalSessionRevoker sessionRevoker;

	AccountRecoveryController(CustomerRecovery recovery, CustomerAccountDirectory directory,
			PasswordEncoder passwordEncoder, PrincipalSessionRevoker sessionRevoker) {
		this.recovery = recovery;
		this.directory = directory;
		this.passwordEncoder = passwordEncoder;
		this.sessionRevoker = sessionRevoker;
	}

	/** Wire DTO for a forgot-password request. */
	record ForgotPasswordRequest(String email) {
		ForgotPasswordRequest {
			if (email == null || email.isBlank()) {
				throw new IllegalArgumentException("email is required");
			}
		}
	}

	/** Wire DTO for redeeming a reset token + setting a new password. */
	record ResetPasswordRequest(String token, String newPassword) {
		ResetPasswordRequest {
			if (token == null || token.isBlank() || newPassword == null || newPassword.isEmpty()) {
				throw new IllegalArgumentException("token and newPassword are required");
			}
		}
	}

	/** Wire DTO for redeeming an email-verification token. */
	record VerifyEmailRequest(String token) {
		VerifyEmailRequest {
			if (token == null || token.isBlank()) {
				throw new IllegalArgumentException("token is required");
			}
		}
	}

	/**
	 * Request a password-reset link. Always {@code 204} (non-enumeration, D-8): a reset token is issued +
	 * mailed only when the email actually has an account, but the response never reveals which.
	 */
	@PostMapping(FORGOT_PASSWORD_PATH)
	ResponseEntity<Void> forgotPassword(@RequestBody ForgotPasswordRequest request) {
		String email = CustomerPasswords.normalizeEmail(request.email());
		directory.accountFor(email).ifPresent(accountId -> recovery.sendPasswordResetEmail(accountId, email));
		return ResponseEntity.noContent().build();
	}

	/**
	 * Redeem a reset token and set the new password. On success every session for that account is
	 * invalidated (AC-3), so an attacker's live session cannot outlive the old password. A weak password
	 * is {@code 400 INVALID_REQUEST}; a bad/expired/used token is {@code 400 INVALID_OR_EXPIRED_TOKEN}.
	 */
	@PostMapping(RESET_PASSWORD_PATH)
	ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request) {
		CustomerPasswords.validate(request.newPassword());
		return switch (recovery.resetPassword(request.token(), passwordEncoder.encode(request.newPassword()))) {
			case ResetPasswordOutcome.Reset(var accountId, var email) -> {
				sessionRevoker.revokeAll(email);
				yield ResponseEntity.noContent().build();
			}
			case ResetPasswordOutcome.InvalidOrExpired ignored ->
				ApiProblem.response(HttpStatus.BAD_REQUEST, INVALID_TOKEN_CODE, INVALID_TOKEN_DETAIL);
		};
	}

	/** Redeem an email-verification token → mark the account's email verified, or {@code 400} on a bad token. */
	@PostMapping(VERIFY_EMAIL_PATH)
	ResponseEntity<?> verifyEmail(@RequestBody VerifyEmailRequest request) {
		return switch (recovery.verifyEmail(request.token())) {
			case VerifyEmailOutcome.Verified ignored -> ResponseEntity.noContent().build();
			case VerifyEmailOutcome.InvalidOrExpired ignored ->
				ApiProblem.response(HttpStatus.BAD_REQUEST, INVALID_TOKEN_CODE, INVALID_TOKEN_DETAIL);
		};
	}
}
