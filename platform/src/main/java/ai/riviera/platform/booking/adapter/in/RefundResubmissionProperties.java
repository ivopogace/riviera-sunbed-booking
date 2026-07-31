package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The cooldown behind the ADMIN refund-resubmit lever (#454), externalised so the window can be
 * matched to real gateway behaviour without a deploy — the {@code MailResubmissionProperties}
 * argument, for a knob whose right value is likewise unknowable until the {@code stripe} profile
 * takes real incident traffic.
 *
 * <p><strong>The value that ships lives in {@code application.properties}, not here.</strong> The
 * {@code @DefaultValue} is a backstop for a context bound without that file; deployment reads the
 * {@code ${RIVIERA_REFUND_RESUBMIT_COOLDOWN_MS:…}} placeholder, which is also the only reason a
 * readable env-var name works at all under relaxed binding.
 *
 * <p><strong>Both bounds matter, and the lower one is the load-shaped half.</strong> A non-positive
 * cooldown boots cleanly and reduces the throttle to the single-flight lock alone, which does not
 * outlive one call. During a gateway outage every re-driven refund fails fast and is immediately
 * outstanding again, so a held-down button becomes a retry storm against the gateway that is already
 * struggling — with the money safe (idempotency keys) but every press reporting success. The floor is
 * deliberately above one second: anything shorter cannot outlive even a healthy gateway round-trip.
 *
 * <p>The ceiling bounds the typo from the other side: an oversized value does not fail — it refuses
 * every press for hours, so the lever an admin reaches for during an incident answers
 * {@code COOLING_DOWN} and nothing else. The whole point of #454 is to shorten a retry horizon that
 * used to be "the next deploy", not to lengthen it.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated} + {@code @Min}: #97
 * declined {@code spring-boot-starter-validation} deliberately, so an annotation here would bind and
 * validate nothing.
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
