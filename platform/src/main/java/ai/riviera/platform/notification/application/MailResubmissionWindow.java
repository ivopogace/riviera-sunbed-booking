package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * How long the resubmit lever refuses after an accepted press (#405).
 *
 * <p><strong>Why a window and not just a lock.</strong> A mutex answers only the truly simultaneous
 * case. The one that actually recurs is sequential: during a relay outage every send fails fast, the
 * registry marks each publication {@code FAILED}, and the whole scope is eligible again within
 * milliseconds — so a second press moments later re-sweeps everything and re-attempts every send. The
 * mail itself is safe either way (the registry's own claim covers a send still in flight), but the
 * relay is not, and neither is the admin's read of the result: without this window every press reports
 * a success that moved nothing.
 *
 * <p><strong>Why it is not derived from {@link MailTransportBudget}.</strong> Tempting, since that
 * budget already bounds one socket operation. But the relevant span here is a queued backlog draining
 * through a two-thread pool, not one socket call, and tying the two would mean tightening the relay
 * timeout silently narrows the sweep throttle. They answer different questions, so they stay separate
 * knobs — with this one's bounds validated where it is bound ({@code MailResubmissionProperties}).
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
							+ "; a zero window would leave only the single-flight lock, which does not "
							+ "outlive one call — so an admin pressing through a relay outage would sweep "
							+ "and re-attempt every outstanding send on every press");
		}
	}
}
