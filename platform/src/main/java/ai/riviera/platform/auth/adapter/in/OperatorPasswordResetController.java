package ai.riviera.platform.auth.adapter.in;

import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.auth.api.SessionRevocation;
import ai.riviera.platform.auth.application.OperatorResetLinks;
import ai.riviera.platform.auth.application.PasswordPolicy;
import ai.riviera.platform.operator.api.OperatorPasswordReset;
import ai.riviera.platform.operator.vocabulary.OperatorResetOutcome;
import ai.riviera.platform.shared.ApiProblem;

/**
 * Redeems an admin-issued operator reset link (#1737), the operator twin of the customer reset in
 * {@link AccountRecoveryController}: anonymous, the token being the bearer credential (invariant #7), on its own
 * rate-limit budget. Every refused token is one {@code 400 INVALID_OR_EXPIRED_TOKEN}. A success leaves the operator
 * signed out everywhere. Rationale: RESPONSIBILITIES.md §auth.
 */
@RestController
class OperatorPasswordResetController {

	private static final String RESET_PASSWORD_PATH = "/api/auth/operator/reset-password";

	private final OperatorPasswordReset passwordReset;
	private final OperatorResetLinks resetLinks;
	private final PasswordEncoder passwordEncoder;
	private final SessionRevocation sessionRevoker;

	OperatorPasswordResetController(OperatorPasswordReset passwordReset, OperatorResetLinks resetLinks,
			PasswordEncoder passwordEncoder, SessionRevocation sessionRevoker) {
		this.passwordReset = passwordReset;
		this.resetLinks = resetLinks;
		this.passwordEncoder = passwordEncoder;
		this.sessionRevoker = sessionRevoker;
	}

	/** Wire DTO for redeeming an operator reset token with the chosen password. */
	record OperatorResetPasswordRequest(String token, String newPassword) {
		OperatorResetPasswordRequest {
			if (token == null || token.isBlank() || newPassword == null || newPassword.isEmpty()) {
				throw new IllegalArgumentException("token and newPassword are required");
			}
		}

		@Override
		public String toString() {
			return "OperatorResetPasswordRequest[redacted]";
		}
	}

	/**
	 * Revoke the operator's sessions before and after the credential write, as the customer reset does; the bcrypt
	 * encode stays above the first revoke, or its cost widens the gap a sign-in could land in.
	 */
	@PostMapping(RESET_PASSWORD_PATH)
	ResponseEntity<?> resetPassword(@RequestBody OperatorResetPasswordRequest request) {
		PasswordPolicy.validate(request.newPassword());
		String tokenHash = resetLinks.hash(request.token());
		Optional<String> username = passwordReset.usernameForResetToken(tokenHash);
		username.ifPresent(name -> PasswordPolicy.validate(request.newPassword(), name));
		String newPasswordHash = passwordEncoder.encode(request.newPassword());
		username.ifPresent(sessionRevoker::revokeAll);
		return switch (passwordReset.resetPassword(tokenHash, newPasswordHash)) {
			case OperatorResetOutcome.Reset(var resetUsername) -> {
				sessionRevoker.revokeAll(resetUsername);
				yield ResponseEntity.noContent().build();
			}
			case OperatorResetOutcome.InvalidOrExpired ignored -> ApiProblem.response(HttpStatus.BAD_REQUEST,
					"INVALID_OR_EXPIRED_TOKEN", "The link is invalid or has expired.");
		};
	}
}
