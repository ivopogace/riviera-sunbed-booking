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
import ai.riviera.platform.notification.api.MailSender;

/**
 * Edge orchestrator for the S8 (#113) account-recovery flows — the credential-material machinery that
 * must stay at the platform edge (RV-BE-11), keeping the controllers thin and the {@code customer}
 * module free of tokens/mail/crypto. It mints + hashes the raw token, drives the module's
 * {@link CustomerAccountRecovery} port with only the opaque digest, and hands the raw token to the
 * {@code notification} module's {@link MailSender} inside the emailed link (#382) — a fire-and-forget
 * port that runs the send off this thread, swallows transport failures and enforces suppression, so
 * the D-8 non-enumeration and #369 timing-oracle guarantees hold behind that seam rather than here.
 *
 * <p>The email links point at the SPA routes {@code /account/verify} and {@code /account/reset} on the
 * configured {@link RecoveryProperties#linkBaseUrl()} — the SPA renders the page and issues the actual
 * verify/reset {@code POST} (so an email scanner prefetching the link — a GET — never consumes the
 * single-use token, R-6). Package-private (invariant #11).
 */
@Component
class CustomerRecovery {

	static final String VERIFY_PATH = "/account/verify";
	static final String RESET_PATH = "/account/reset";
	private static final String TOKEN_PARAM = "token";

	private final CustomerAccountRecovery recovery;
	private final MailSender mails;
	private final RecoveryTokens tokens;
	private final RecoveryProperties properties;
	private final Clock clock;

	CustomerRecovery(CustomerAccountRecovery recovery, MailSender mails, RecoveryTokens tokens,
			RecoveryProperties properties, Clock clock) {
		this.recovery = recovery;
		this.mails = mails;
		this.tokens = tokens;
		this.properties = properties;
		this.clock = clock;
	}

	/** Issue a fresh verification token for the account and (best-effort, off-thread) email its link. */
	void sendVerificationEmail(CustomerAccountId accountId, String email) {
		String rawToken = tokens.generate();
		recovery.issueEmailVerificationToken(accountId, tokens.hash(rawToken),
				clock.instant().plus(properties.verificationTokenTtl()));
		// The token store above is NOT best-effort and stays on this thread; only the send is (#369, R-3).
		mails.sendEmailVerification(email, link(VERIFY_PATH, rawToken));
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
	 * the caller revoke that principal's sessions before {@link #resetPassword} changes anything (#357).
	 * Consumes nothing; empty for any token the redemption would reject.
	 */
	Optional<String> emailForResetToken(String rawToken) {
		return recovery.emailForResetToken(tokens.hash(rawToken));
	}

	/** Set the account's already-encoded password directly (authenticated set-password, closes S4 F-1). */
	void setPassword(CustomerAccountId accountId, String encodedNewPassword) {
		recovery.setPassword(accountId, encodedNewPassword);
	}

	/** Whether the account's email is verified (for the signed-in "please verify" nudge). */
	boolean isVerified(CustomerAccountId accountId) {
		return recovery.isEmailVerified(accountId);
	}

	private URI link(String path, String rawToken) {
		return UriComponentsBuilder.fromUriString(properties.linkBaseUrl())
				.path(path)
				.queryParam(TOKEN_PARAM, rawToken)
				.build()
				.toUri();
	}
}
