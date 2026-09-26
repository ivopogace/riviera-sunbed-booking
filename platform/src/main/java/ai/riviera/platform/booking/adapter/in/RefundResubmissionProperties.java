package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The ADMIN refund-resubmit lever's cooldown. It ships from {@code application.properties}, whose
 * placeholder alone binds {@code RIVIERA_REFUND_RESUBMIT_COOLDOWN_MS}; {@code @DefaultValue} is a
 * backstop. An out-of-bounds value fails the context: too short and a held-down button storms a
 * struggling gateway, too long and the lever answers {@code COOLING_DOWN} all incident. Checked here,
 * not by {@code @Min}: without {@code spring-boot-starter-validation} that would check nothing.
 *
 * @param cooldownMs how long an accepted resubmission refuses the next one
 */
@ConfigurationProperties("riviera.booking.refund-resubmission")
record RefundResubmissionProperties(@DefaultValue("60000") int cooldownMs) {

	/** Below this the window cannot outlive a single healthy gateway round-trip, so it guards nothing. */
	static final int MIN_COOLDOWN_MS = 5_000;

	/** 24× the shipped minute. Past this the lever is unusable during the incident it exists for. */
	static final int MAX_COOLDOWN_MS = 24 * 60 * 1_000;

	RefundResubmissionProperties {
		if (cooldownMs < MIN_COOLDOWN_MS || cooldownMs > MAX_COOLDOWN_MS) {
			throw new IllegalArgumentException(
					"riviera.booking.refund-resubmission.cooldown-ms must be between " + MIN_COOLDOWN_MS
							+ " and " + MAX_COOLDOWN_MS + ", but was " + cooldownMs
							+ "; too short and the throttle collapses to the single-flight lock, which does "
							+ "not outlive one call, so a held-down button re-asks the gateway for every "
							+ "outstanding refund — and too long and the lever answers COOLING_DOWN through "
							+ "the whole incident it exists for");
		}
	}
}
