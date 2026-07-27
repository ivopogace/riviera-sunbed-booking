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
 * @param verificationTokenTtl how long an email-verification token stays valid (default 24h)
 * @param resetTokenTtl        how long a password-reset token stays valid (default 1h)
 * @param linkBaseUrl          absolute base URL the emailed verify/reset links are built on
 */
@ConfigurationProperties("riviera.recovery")
record RecoveryProperties(
		@DefaultValue("PT24H") Duration verificationTokenTtl,
		@DefaultValue("PT1H") Duration resetTokenTtl,
		@DefaultValue("http://localhost:4200") String linkBaseUrl) {
}
