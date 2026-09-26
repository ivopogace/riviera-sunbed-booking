package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * How long the resubmit lever refuses after an accepted press. A window, not just a lock: in a
 * relay outage every send fails fast and is eligible again within milliseconds, so without it each
 * press re-sweeps and re-attempts every send. Keep it independent of {@link MailTransportBudget}:
 * it spans a draining backlog, not one socket call, and tying them lets a relay-timeout change
 * silently move this throttle. Bounds are validated in {@code MailResubmissionProperties}.
 *
 * @param cooldown the refusal window; positive by construction
 */
public record MailResubmissionWindow(Duration cooldown) {

	public MailResubmissionWindow {
		if (cooldown == null || cooldown.isZero() || cooldown.isNegative()) {
			throw new IllegalArgumentException(
					"cooldown must be a positive duration, but was " + cooldown
							+ "; a zero window would leave only the single-flight lock, which does not "
							+ "outlive one call — so an admin pressing through a relay outage would sweep "
							+ "and re-attempt every outstanding send on every press");
		}
	}
}
