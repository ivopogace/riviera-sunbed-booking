package ai.riviera.platform;

import ai.riviera.platform.shared.ApiProblem;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

/**
 * Public customer account-recovery endpoints (design D-6/D-8): request a password reset,
 * redeem a reset token, and redeem an email-verification token. Anonymous by definition (the token is
 * the bearer credential, invariant #7) — permitted in {@link SecurityConfig} and behind the
 * {@code RateLimitFilter} recovery budget. Platform-edge login machinery (RV-BE-11): the {@code customer}
 * module only stores the opaque token digest and flips state via its {@code api/} port.
 *
 * <p><strong>Non-enumeration (D-8):</strong> {@code forgot-password} returns the SAME {@code 204} whether
 * or not the email has an account; invalid, expired, and already-used tokens all return the same generic
 * {@code 400 INVALID_OR_EXPIRED_TOKEN}. Every 4xx rides the centralized RFC-7807 contract.
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
		String email = Emails.normalize(request.email());
		directory.accountFor(email).ifPresent(accountId -> recovery.sendPasswordResetEmail(accountId, email));
		return ResponseEntity.noContent().build();
	}

	/**
	 * Redeem a reset token and set the new password. Every session for that account is invalidated (AC-3),
	 * so an attacker's live session cannot outlive the old password. A weak password is
	 * {@code 400 INVALID_REQUEST}; a bad/expired/used token is {@code 400 INVALID_OR_EXPIRED_TOKEN}.
	 *
	 * <p><strong>The revoke brackets the write</strong> (#357). <em>Before</em>, because the two effects are
	 * not atomic and cannot be — the password write is the {@code customer} module's transaction, the
	 * session deletes are Spring Session's, so a {@code @Transactional} here would look atomic without
	 * being atomic (#344 D-1). Revoking only afterwards, as S8 shipped, meant a transient revoke failure
	 * returned {@code 500} with the token already spent: the customer retries the emailed link, is told it
	 * is invalid or expired, and the session the reset existed to kill is still alive. Revoke-first is only
	 * possible because {@link CustomerRecovery#emailForResetToken} names the account without consuming the
	 * token; if it names nobody, the redemption below rejects the token anyway and nothing was revoked.
	 *
	 * <p><em>And after</em>, because revoking only first would leave a window in which the OLD password
	 * still works — the credential an attacker holds in exactly the scenario this endpoint recovers from —
	 * so a sign-in landing there would survive the reset. The bcrypt encode is hoisted above the revoke to
	 * keep that window to a single write (#344 F-4: at ~80ms the encode would otherwise dominate it). What
	 * no ordering removes is a failure in the trailing revoke, which still reports an error with the
	 * password already changed — by then every session that existed when the request started is gone.
	 */
	@PostMapping(RESET_PASSWORD_PATH)
	ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request) {
		CustomerPasswords.validate(request.newPassword());
		String newPasswordHash = passwordEncoder.encode(request.newPassword());
		recovery.emailForResetToken(request.token()).ifPresent(sessionRevoker::revokeAll);
		return switch (recovery.resetPassword(request.token(), newPasswordHash)) {
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
