package ai.riviera.platform.customer.api;

import java.time.Instant;
import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

/**
 * Published port for the customer account's email-verification + password-recovery lifecycle. The edge
 * owns all credential material (generates the raw token, hashes it to {@code tokenHash}, encodes the
 * password); this module stores the digest and enforces single-use + expiry atomically in SQL, with no
 * Spring Security type inside (RV-BE-11, {@code CustomerAuthPlacementTests}). Tokens are bearer
 * credentials (the #7 posture): reused, expired and unknown tokens all yield the neutral
 * {@code InvalidOrExpired} (non-enumerating, design D-8). Email verification is soft: it gates nothing.
 */
public interface CustomerAccountRecovery {

	/** Issue an email-verification token for the account, invalidating its prior unconsumed ones. */
	void issueEmailVerificationToken(CustomerAccountId accountId, String tokenHash, Instant expiresAt);

	/** Issue a password-reset token for the account, invalidating its prior unconsumed ones. */
	void issuePasswordResetToken(CustomerAccountId accountId, String tokenHash, Instant expiresAt);

	/** Redeem a verification token (single-use): on success mark the account's email verified. */
	VerifyEmailOutcome verifyEmail(String tokenHash);

	/** Redeem a reset token (single-use): on success set the account's password to {@code newPasswordHash}. */
	ResetPasswordOutcome resetPassword(String tokenHash, String newPasswordHash);

	/**
	 * The email of the account a reset token unlocks, by {@link #resetPassword}'s claim predicate but
	 * consuming nothing; empty for any token that write would reject. The edge revokes first, so a
	 * failed revoke leaves the link usable: {@code RESPONSIBILITIES.md} §Platform edge.
	 */
	Optional<String> emailForResetToken(String tokenHash);

	/**
	 * Set the account's password directly (authenticated set-password, closes S4 F-1). The edge authorizes
	 * the caller (own session) and, when the account already has a password, verifies the current one first;
	 * this write is unconditional. Lets an SSO-only (password-less) account gain a local password.
	 */
	void setPassword(CustomerAccountId accountId, String newPasswordHash);

	/**
	 * Whether the email's account is verified (the "please verify" nudge on {@code /api/auth/me}), or
	 * empty when no account exists. Keyed by email, the session principal's name, so the edge needs one
	 * read; the email is normalized before lookup (as {@link CustomerAccountDirectory#accountFor}).
	 */
	Optional<Boolean> emailVerifiedFor(String email);
}
