package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * How long the resubmit lever refuses after an accepted press (#405).
 *
 * <p><strong>Why a window and not just a lock.</strong> A mutex alone answers only the truly
 * simultaneous case. The registry marks a publication complete after the listener returns, and that
 * listener is {@code @Async} on {@code registryMailExecutor} (#383), so from the moment a resubmission
 * is accepted until its last send finishes the very same rows are still outstanding and still in
 * scope. A second press inside that gap would find them and send them all again — the duplicate this
 * window exists to prevent.
 *
 * <p><strong>Why it is not derived from {@link MailTransportBudget}.</strong> Tempting, since that
 * budget already bounds one socket operation. But the relevant span here is a queued backlog draining
 * through a two-thread pool, not one socket call, and tying the two would mean tightening the relay
 * timeout silently narrows the duplicate guard. They answer different questions, so they stay
 * separate knobs — with this one's bounds validated where it is bound
 * ({@code MailResubmissionProperties}).
 *
 * <p>A plain application-layer value carrying no configuration type — the
 * {@code MailTransportProperties → MailTransportBudget} pattern, so the inner hexagon stays
 * framework-light.
 *
 * @param cooldown the refusal window; positive by construction
 */
public record MailResubmissionWindow(Duration cooldown) {

	public MailResubmissionWindow {
		if (cooldown == null || cooldown.isZero() || cooldown.isNegative()) {
			throw new IllegalArgumentException(
					"cooldown must be a positive duration, but was " + cooldown
							+ "; a zero window would leave only the single-flight lock, which cannot see a "
							+ "send that is still draining on the registry mail pool — the duplicate this "
							+ "window exists to prevent");
		}
	}
}
