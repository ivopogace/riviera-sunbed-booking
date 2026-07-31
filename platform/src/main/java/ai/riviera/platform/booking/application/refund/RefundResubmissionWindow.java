package ai.riviera.platform.booking.application.refund;

import java.time.Duration;

/**
 * How long the refund-resubmit lever refuses after an accepted press (#454).
 *
 * <p><strong>Why a window and not just a lock.</strong> A mutex answers only the truly simultaneous
 * case. The recurring one is sequential: during a gateway outage every re-driven refund fails fast and
 * its publication is immediately outstanding again, so a second press moments later re-sweeps
 * everything and re-asks the gateway for every refund it just refused. The money is safe either way
 * (idempotency keys; the registry's claim), but the gateway is not, and neither is the admin's read of
 * the result: without this window every press reports a success that settled nothing.
 *
 * <p>A plain application-layer value carrying no configuration type — the
 * {@code MailResubmissionWindow} pattern, so the inner hexagon stays framework-light; bounds are
 * validated where the value is bound ({@code RefundResubmissionProperties}).
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
