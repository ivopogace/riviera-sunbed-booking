package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Cooldown in milliseconds of the ADMIN mail-resubmit lever. The shipped value and its
 * {@code RIVIERA_MAIL_RESUBMIT_COOLDOWN_MS} override live in {@code application.properties};
 * {@code @DefaultValue} is only a backstop. Bounded [{@link #MIN_COOLDOWN_MS},
 * {@link #MAX_COOLDOWN_MS}] in the compact constructor ({@code @Min} would validate nothing — no
 * validation starter): too short and a held-down button storms a failing relay with re-sends; too long
 * and the lever answers {@code COOLING_DOWN} through the whole incident.
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
							+ "; too short and the throttle collapses to the single-flight lock, which does not "
							+ "outlive one call, so a held-down button re-sweeps and re-attempts every "
							+ "outstanding send — and too long and the lever answers COOLING_DOWN through "
							+ "the whole incident it exists for");
		}
	}
}
