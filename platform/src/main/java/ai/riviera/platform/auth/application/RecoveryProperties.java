package ai.riviera.platform.auth.application;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Account-recovery tunables from {@code riviera.recovery.*}. The reset TTL (default 1h) stays shorter than the
 * verification TTL (24h): a leaked reset link is account takeover. {@code linkBaseUrl} is the absolute origin emailed
 * links point at — set {@code RIVIERA_RECOVERY_LINK_BASE_URL} in demo/prod, or every link points at a dead origin.
 * Both TTLs are bounded at bind time: {@link CustomerRecovery} stamps {@code now + ttl}, so a zero TTL makes every token
 * born expired while every send succeeds. Checked in the compact constructor, not with {@code @Min}: there is no JSR-303
 * implementation on the classpath, so an annotation would validate nothing.
 */
@ConfigurationProperties("riviera.recovery")
public record RecoveryProperties(
		@DefaultValue("PT24H") Duration verificationTokenTtl,
		@DefaultValue("PT1H") Duration resetTokenTtl,
		@DefaultValue("http://localhost:4200") String linkBaseUrl) {

	/**
	 * Shared floor, above zero because the mail is the slow part: recovery sends leave the request thread
	 * and travel through an SMTP relay, so under a minute the token can be expired before
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
	 * 24× the shipped 1h, far tighter than the verification ceiling: longer leaves an account-takeover credential in a
	 * mailbox for a day. The TTLs are bounded independently; nothing rejects a pair that inverts the shipped ordering.
	 */
	static final Duration MAX_RESET_TOKEN_TTL = Duration.ofHours(24);

	public RecoveryProperties {
		requireInRange("riviera.recovery.verification-token-ttl", verificationTokenTtl,
				MAX_VERIFICATION_TOKEN_TTL);
		requireInRange("riviera.recovery.reset-token-ttl", resetTokenTtl, MAX_RESET_TOKEN_TTL);
		if (linkBaseUrl != null && linkBaseUrl.contains("${")) {
			throw new IllegalArgumentException(
					"riviera.recovery.link-base-url is unresolved (" + linkBaseUrl + "): set RIVIERA_RECOVERY_LINK_BASE_URL");
		}
		linkBaseUrl = requireAbsoluteOrigin(linkBaseUrl);
	}

	private static String requireAbsoluteOrigin(String linkBaseUrl) {
		String problem = "riviera.recovery.link-base-url must be an absolute URL with a host (e.g. "
				+ "https://riviera-sunbed-booking.onrender.com): set RIVIERA_RECOVERY_LINK_BASE_URL, but was ";
		if (linkBaseUrl == null || linkBaseUrl.isBlank()) {
			throw new IllegalArgumentException(problem + "blank");
		}
		String stripped = linkBaseUrl.strip();
		URI parsed;
		try {
			parsed = URI.create(stripped);
		} catch (IllegalArgumentException e) {
			throw new IllegalArgumentException(problem + linkBaseUrl, e);
		}
		if (!parsed.isAbsolute() || parsed.getHost() == null) {
			throw new IllegalArgumentException(problem + linkBaseUrl);
		}
		return stripped;
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
