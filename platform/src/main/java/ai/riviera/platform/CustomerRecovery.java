package ai.riviera.platform;

import java.net.URI;
import java.time.Clock;
import java.util.Optional;

import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;
import ai.riviera.platform.notification.api.MailDeliverability;
import ai.riviera.platform.notification.api.MailSender;

/**
 * Edge orchestrator for account recovery, keeping tokens, mail and crypto out of {@code customer}
 * (RV-BE-11): mints and hashes the raw token, hands {@link CustomerAccountRecovery} only the digest,
 * and mails the raw token in a link via {@link MailSender}, which sends off-thread, swallows failures
 * and enforces suppression, so the D-8 non-enumeration and timing guarantees hold behind that seam.
 *
 * <p>Links target the SPA routes {@code /account/verify} and {@code /account/reset}, which issue the
 * {@code POST}: a mail scanner prefetching the link (a GET) must never consume the single-use token.
 */
@Component
class CustomerRecovery {

	static final String VERIFY_PATH = "/account/verify";
	static final String RESET_PATH = "/account/reset";
	private static final String TOKEN_PARAM = "token";

	private final CustomerAccountRecovery recovery;
	private final MailSender mails;
	private final MailDeliverability deliverability;
	private final RecoveryTokens tokens;
	private final RecoveryProperties properties;
	private final Clock clock;

	CustomerRecovery(CustomerAccountRecovery recovery, MailSender mails, MailDeliverability deliverability,
			RecoveryTokens tokens, RecoveryProperties properties, Clock clock) {
		this.recovery = recovery;
		this.mails = mails;
		this.deliverability = deliverability;
		this.tokens = tokens;
		this.properties = properties;
		this.clock = clock;
	}

	/** Issue a fresh verification token for the account and (best-effort, off-thread) email its link. */
	void sendVerificationEmail(CustomerAccountId accountId, String email) {
		String rawToken = tokens.generate();
		recovery.issueEmailVerificationToken(accountId, tokens.hash(rawToken),
				clock.instant().plus(properties.verificationTokenTtl()));
		// The token store above is NOT best-effort and stays on this thread; only the send is.
		mails.sendEmailVerification(email, link(VERIFY_PATH, rawToken));
	}

	/**
	 * Whether a mail to this address would be withheld as suppressed. Only for an address the caller
	 * owns (the authenticated resend), as it discloses that. Keep it out of
	 * {@link #sendVerificationEmail}: on anonymous registration the extra read reopens a D-8 timing gap.
	 */
	boolean isVerificationMailWithheld(String email) {
		return deliverability.isWithheld(email);
	}

	/** Issue a fresh password-reset token for the account and (best-effort, off-thread) email its link. */
	void sendPasswordResetEmail(CustomerAccountId accountId, String email) {
		String rawToken = tokens.generate();
		recovery.issuePasswordResetToken(accountId, tokens.hash(rawToken),
				clock.instant().plus(properties.resetTokenTtl()));
		mails.sendPasswordReset(email, link(RESET_PATH, rawToken));
	}

	/** Redeem a presented raw verification token (hashes it, then claims it single-use in the module). */
	VerifyEmailOutcome verifyEmail(String rawToken) {
		return recovery.verifyEmail(tokens.hash(rawToken));
	}

	/** Redeem a presented raw reset token, setting the already-encoded new password on success. */
	ResetPasswordOutcome resetPassword(String rawToken, String encodedNewPassword) {
		return recovery.resetPassword(tokens.hash(rawToken), encodedNewPassword);
	}

	/**
	 * Whose account a presented raw reset token unlocks, while it is still redeemable — the read that lets
	 * the caller revoke that principal's sessions before {@link #resetPassword} changes anything.
	 * Consumes nothing; empty for any token the redemption would reject.
	 */
	Optional<String> emailForResetToken(String rawToken) {
		return recovery.emailForResetToken(tokens.hash(rawToken));
	}

	/** Set the account's already-encoded password directly (the authenticated set-password). */
	void setPassword(CustomerAccountId accountId, String encodedNewPassword) {
		recovery.setPassword(accountId, encodedNewPassword);
	}

	/**
	 * Whether the email's account is verified (the signed-in "please verify" nudge), or empty when no
	 * account exists — one read per {@code /api/auth/me} restore.
	 */
	Optional<Boolean> verifiedFor(String email) {
		return recovery.emailVerifiedFor(email);
	}

	private URI link(String path, String rawToken) {
		return UriComponentsBuilder.fromUriString(properties.linkBaseUrl())
				.path(path)
				.queryParam(TOKEN_PARAM, rawToken)
				.build()
				.toUri();
	}
}
