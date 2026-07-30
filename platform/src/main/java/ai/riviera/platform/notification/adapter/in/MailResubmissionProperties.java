package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The cooldown behind the ADMIN resubmit lever (#405), externalised so the window can be matched to a
 * real relay's drain rate without a deploy — the {@code RegistryMailProperties} argument (#408),
 * applied to a knob whose right value is likewise unknowable until #370 puts traffic through it.
 *
 * <p><strong>The value that ships lives in {@code application.properties}, not here.</strong> The
 * {@code @DefaultValue} is a backstop for a context bound without that file; deployment reads the
 * {@code ${RIVIERA_MAIL_RESUBMIT_COOLDOWN_MS:…}} placeholder, and that placeholder is also the only
 * reason a readable env-var name works at all — the relaxed-binding form of
 * {@code riviera.notification.mail-resubmission.cooldown-ms} would be
 * {@code RIVIERA_NOTIFICATION_MAILRESUBMISSION_COOLDOWNMS}.
 *
 * <p><strong>Both bounds matter, and the lower one is the security-shaped half.</strong> A
 * non-positive cooldown boots cleanly and silently reduces the duplicate guard to the single-flight
 * lock alone — which cannot see a send still draining on {@code registryMailExecutor}, so a rapid
 * second press would re-send every outstanding mail. That is the exact failure AC-3 forbids, arriving
 * as configuration rather than as code. The floor is deliberately above one second: anything shorter
 * cannot outlive even a healthy relay round-trip, so it would satisfy the "positive" check while
 * providing no window at all.
 *
 * <p>The ceiling bounds the typo from the other side. An oversized value does not fail — it just
 * refuses every press for hours, so the lever an admin reaches for during an incident reports
 * {@code COOLING_DOWN} and nothing else, which reads as a broken button rather than as a
 * misconfiguration. A day is far past any plausible tuning (the registry's own retry horizon before
 * this issue was "the next deploy", and shortening that is the point).
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated} + {@code @Min}: Boot
 * validates {@code @ConfigurationProperties} only with a JSR-303 implementation on the classpath, and
 * #97 declined {@code spring-boot-starter-validation} deliberately in favour of explicit checks in
 * records ({@code riviera-java-conventions} §2/§6b). An annotation here would bind and validate
 * nothing.
 *
 * @param cooldownMs how long an accepted resubmission refuses the next one
 */
@ConfigurationProperties("riviera.notification.mail-resubmission")
record MailResubmissionProperties(@DefaultValue("60000") int cooldownMs) {

	/** Below this the window cannot outlive a single healthy relay round-trip, so it guards nothing. */
	static final int MIN_COOLDOWN_MS = 5_000;

	/** 24× the shipped minute. Past this the lever is unusable during the incident it exists for. */
	static final int MAX_COOLDOWN_MS = 24 * 60 * 1_000;

	MailResubmissionProperties {
		if (cooldownMs < MIN_COOLDOWN_MS || cooldownMs > MAX_COOLDOWN_MS) {
			throw new IllegalArgumentException(
					"riviera.notification.mail-resubmission.cooldown-ms must be between " + MIN_COOLDOWN_MS
							+ " and " + MAX_COOLDOWN_MS + ", but was " + cooldownMs
							+ "; too short and the duplicate guard collapses to the single-flight lock, which "
							+ "cannot see a send still draining on the registry mail pool, so a rapid second "
							+ "press re-sends every outstanding mail — and too long and the lever answers "
							+ "COOLING_DOWN through the whole incident it exists for");
		}
	}
}
