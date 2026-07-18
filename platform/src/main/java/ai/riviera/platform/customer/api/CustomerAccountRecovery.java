package ai.riviera.platform.customer.api;

import java.time.Instant;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

/**
 * Published port for the customer account's email-verification + password-recovery lifecycle (S8, epic
 * #108) — one purposeful conversation the platform edge drives. The edge owns all credential-material
 * transformation: it generates the raw token, hashes it to the opaque {@code tokenHash} passed here, and
 * encodes the password. This module stores the digest, enforces single-use + expiry atomically in SQL,
 * and flips verification state — never importing a Spring Security type (RV-BE-11,
 * {@code CustomerAuthPlacementTests}).
 *
 * <p>Tokens are bearer credentials (invariant #7): {@code tokenHash} is a deterministic digest of an
 * unguessable raw token; redemption is single-use, and a second/expired/unknown redemption all yield the
 * neutral {@code InvalidOrExpired} (non-enumeration, design D-8). Email verification is <em>soft</em> — it
 * gates nothing functional in v1 (no guest-booking back-linking; design D-6 amended 2026-07-17).
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
	 * Set the account's password directly (authenticated set-password, closes S4 F-1). The edge authorizes
	 * the caller (own session) and, when the account already has a password, verifies the current one first;
	 * this write is unconditional. Lets an SSO-only (password-less) account gain a local password.
	 */
	void setPassword(CustomerAccountId accountId, String newPasswordHash);

	/** Whether the account's email is verified (for the signed-in "please verify" nudge on {@code /api/auth/me}). */
	boolean isEmailVerified(CustomerAccountId accountId);
}
