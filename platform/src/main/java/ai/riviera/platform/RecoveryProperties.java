package ai.riviera.platform;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Tunables for S8 (#113) account recovery. Bound from {@code riviera.recovery.*} (defaults documented in
 * {@code application.properties}); every value is configurable per environment.
 *
 * <p>The reset token TTL is deliberately shorter than the verification TTL — a password reset is the more
 * sensitive credential. {@code linkBaseUrl} is the absolute origin the emailed links point at (the SPA is
 * served same-origin by the backend since #110, so in demo/prod it is that origin — set
 * {@code RIVIERA_RECOVERY_LINK_BASE_URL}, #368; local dev is the separate {@code :4200} SPA dev server).
 * With the real {@code SmtpMailer} active a wrong value means every emailed link points at a dead origin.
 *
 * <p><strong>Both TTLs are bounded at bind time (#426), and the short end is the invisible one.</strong>
 * {@link CustomerRecovery} stamps a token as {@code clock.instant().plus(ttl)}, so {@code PT0S} makes
 * {@code expiresAt == issuedAt}: every token is born expired. Nothing fails — the mail is built, queued
 * and delivered — and the symptom is "the emails arrive and every link says expired", with the reset
 * flow, the only route back into an account, dead for everyone. The ceilings answer the opposite risk:
 * both tokens are unguessable bearer credentials living in a mailbox, and a leaked reset link <em>is</em>
 * account takeover — which is why the reset ceiling ({@code PT24H}) is seven times tighter than the
 * verification one ({@code P7D}), holding the ordering this record already documents.
 *
 * <p>No null-defaulting is needed or added: {@code @DefaultValue} supplies both TTLs at the binder, so
 * the guards run on values that are always present. Validated in a compact constructor rather than with
 * {@code @Validated} + {@code @Min} because Boot validates {@code @ConfigurationProperties} only when a
 * JSR-303 implementation is on the classpath, and there is none (#97 declined
 * {@code spring-boot-starter-validation} in favour of explicit checks in records) — an annotation would
 * bind and validate nothing.
 *
 * @param verificationTokenTtl how long an email-verification token stays valid (default 24h), bounded by
 *        {@link #MIN_TOKEN_TTL} and {@link #MAX_VERIFICATION_TOKEN_TTL}
 * @param resetTokenTtl        how long a password-reset token stays valid (default 1h), bounded by
 *        {@link #MIN_TOKEN_TTL} and {@link #MAX_RESET_TOKEN_TTL}
 * @param linkBaseUrl          absolute base URL the emailed verify/reset links are built on
 */
@ConfigurationProperties("riviera.recovery")
record RecoveryProperties(
		@DefaultValue("PT24H") Duration verificationTokenTtl,
		@DefaultValue("PT1H") Duration resetTokenTtl,
		@DefaultValue("http://localhost:4200") String linkBaseUrl) {

	/**
	 * Shared floor, above zero because the mail is the slow part: recovery sends leave the request thread
	 * (#369) and travel through an SMTP relay (#368), so under a minute the token can be expired before
	 * the message is delivered — the born-expired failure with an extra step, and just as silent.
	 */
	static final Duration MIN_TOKEN_TTL = Duration.ofMinutes(1);

	/**
	 * 7× the shipped 24h. Email verification is soft and non-blocking (D-8), so nothing ever forces the
	 * token to be spent: past a week it is a live credential for an address whose control may since have
	 * changed, kept alive for a sign-up nobody is waiting on.
	 */
	static final Duration MAX_VERIFICATION_TOKEN_TTL = Duration.ofDays(7);

	/**
	 * 24× the shipped 1h, and deliberately far tighter than the verification ceiling, because a reset link
	 * is the more sensitive credential: anything longer leaves an account-takeover credential sitting in a
	 * mailbox for a day. Note what this does <em>not</em> do: the two TTLs are bounded independently, so
	 * nothing rejects a pair that inverts the shipped ordering (say reset {@code PT20H} against
	 * verification {@code PT2H}). A cross-field rule is deliberately absent — each bound answers its own
	 * use site, and the ordering is a property of the shipped defaults, not an invariant either token's
	 * mechanism depends on.
	 */
	static final Duration MAX_RESET_TOKEN_TTL = Duration.ofHours(24);

	RecoveryProperties {
		requireInRange("riviera.recovery.verification-token-ttl", verificationTokenTtl,
				MAX_VERIFICATION_TOKEN_TTL);
		requireInRange("riviera.recovery.reset-token-ttl", resetTokenTtl, MAX_RESET_TOKEN_TTL);
	}

	private static void requireInRange(String property, Duration ttl, Duration max) {
		if (ttl.compareTo(MIN_TOKEN_TTL) < 0 || ttl.compareTo(max) > 0) {
			throw new IllegalArgumentException(
					property + " must be between " + MIN_TOKEN_TTL + " and " + max + ", but was " + ttl
							+ "; a token is stamped as now.plus(ttl), so a zero or negative TTL makes every "
							+ "emailed link expired on arrival while every send still succeeds, and an "
							+ "oversized one leaves an unguessable bearer credential valid in a mailbox long "
							+ "after the flow that issued it");
		}
	}
}
