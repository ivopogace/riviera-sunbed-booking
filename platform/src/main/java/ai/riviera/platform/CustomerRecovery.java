package ai.riviera.platform;

import java.net.URI;
import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;

/**
 * Edge orchestrator for the S8 (#113) account-recovery flows — the credential-material machinery that
 * must stay at the platform edge (RV-BE-11), keeping the controllers thin and the {@code customer}
 * module free of tokens/mail/crypto. It mints + hashes the raw token, drives the module's
 * {@link CustomerAccountRecovery} port with only the opaque digest, and hands the raw token to the
 * {@link Mailer} inside the emailed link.
 *
 * <p>The email links point at the SPA routes {@code /account/verify} and {@code /account/reset} on the
 * configured {@link RecoveryProperties#linkBaseUrl()} — the SPA renders the page and issues the actual
 * verify/reset {@code POST} (so an email scanner prefetching the link — a GET — never consumes the
 * single-use token, R-6). Package-private (invariant #11).
 */
@Component
class CustomerRecovery {

	private static final Logger log = LoggerFactory.getLogger(CustomerRecovery.class);

	static final String VERIFY_PATH = "/account/verify";
	static final String RESET_PATH = "/account/reset";
	private static final String TOKEN_PARAM = "token";

	private final CustomerAccountRecovery recovery;
	private final Mailer mailer;
	private final RecoveryTokens tokens;
	private final RecoveryProperties properties;
	private final Clock clock;

	CustomerRecovery(CustomerAccountRecovery recovery, Mailer mailer, RecoveryTokens tokens,
			RecoveryProperties properties, Clock clock) {
		this.recovery = recovery;
		this.mailer = mailer;
		this.tokens = tokens;
		this.properties = properties;
		this.clock = clock;
	}

	/** Issue a fresh verification token for the account and (best-effort) email its link. */
	void sendVerificationEmail(CustomerAccountId accountId, String email) {
		String rawToken = tokens.generate();
		recovery.issueEmailVerificationToken(accountId, tokens.hash(rawToken),
				clock.instant().plus(properties.verificationTokenTtl()));
		sendQuietly(() -> mailer.sendEmailVerification(email, link(VERIFY_PATH, rawToken)));
	}

	/** Issue a fresh password-reset token for the account and (best-effort) email its link. */
	void sendPasswordResetEmail(CustomerAccountId accountId, String email) {
		String rawToken = tokens.generate();
		recovery.issuePasswordResetToken(accountId, tokens.hash(rawToken),
				clock.instant().plus(properties.resetTokenTtl()));
		sendQuietly(() -> mailer.sendPasswordReset(email, link(RESET_PATH, rawToken)));
	}

	/**
	 * Run a mail send best-effort: the token is already stored, so a transport failure must never fail the
	 * triggering request (registration would 500 after the account+session already exist) nor become a
	 * status-code enumeration oracle (forgot-password must return its uniform 204 whether or not the email
	 * has an account — D-8). The user can simply re-request. Only the mailer send is guarded — a token-store
	 * failure is a real error and still propagates.
	 *
	 * <p>The real {@code SmtpMailer} is deferred (throws {@code UnsupportedOperationException}); when it
	 * ships, its <em>synchronous</em> SMTP round-trip should also move off the request thread so a slower
	 * known-email branch cannot become a <em>timing</em> oracle (tracked with the real-mailer follow-up).
	 */
	private void sendQuietly(Runnable send) {
		try {
			send.run();
		}
		catch (RuntimeException e) {
			// The mailer is a best-effort side channel; never log the raw link/token (invariant #7).
			log.warn("Recovery email send failed ({}); the token was issued, delivery can be retried",
					e.getClass().getSimpleName());
		}
	}

	/** Redeem a presented raw verification token (hashes it, then claims it single-use in the module). */
	VerifyEmailOutcome verifyEmail(String rawToken) {
		return recovery.verifyEmail(tokens.hash(rawToken));
	}

	/** Redeem a presented raw reset token, setting the already-encoded new password on success. */
	ResetPasswordOutcome resetPassword(String rawToken, String encodedNewPassword) {
		return recovery.resetPassword(tokens.hash(rawToken), encodedNewPassword);
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
