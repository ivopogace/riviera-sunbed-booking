package ai.riviera.platform.booking.application.refund;

import java.time.Duration;

/**
 * How long the refund-resubmit lever refuses after an accepted press: a window, not just a lock,
 * so a press during a gateway outage does not re-ask the gateway for every refund. A plain value
 * (the {@code MailResubmissionWindow} pattern); bounds are validated where it is bound
 * ({@code RefundResubmissionProperties}). Rationale: RESPONSIBILITIES.md §booking.
 *
 * @param cooldown the refusal window; positive by construction
 */
public record RefundResubmissionWindow(Duration cooldown) {

	public RefundResubmissionWindow {
		if (cooldown == null || cooldown.isZero() || cooldown.isNegative()) {
			throw new IllegalArgumentException(
					"cooldown must be a positive duration, but was " + cooldown
							+ "; a zero window would leave only the single-flight lock, which does not "
							+ "outlive one call — so an admin pressing through a gateway outage would "
							+ "re-ask the gateway for every outstanding refund on every press");
		}
	}
}
