package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * The relay's per-socket-operation timeout, from which each mail pool's shutdown drain is derived, so
 * tuning one moves the other. The drain is one socket operation, not a whole send: a connect+read+write
 * window would overrun the SIGTERM→SIGKILL grace (ceiling validated in {@code MailTransportProperties}).
 * On expiry pools give up, never {@code shutdownNow()} — an interrupt can duplicate a send already at the
 * relay. Rationale: RESPONSIBILITIES.md §notification, docs/runbooks/observability.md.
 *
 * @param socketTimeout the value of every {@code spring.mail.properties.mail.smtp.*} timeout and each pool's drain window
 */
public record MailTransportBudget(Duration socketTimeout) {

	public MailTransportBudget {
		if (socketTimeout == null || socketTimeout.isZero() || socketTimeout.isNegative()) {
			throw new IllegalArgumentException(
					"socketTimeout must be a positive duration, but was " + socketTimeout
							+ "; it is both the relay's per-operation budget and the pools' shutdown drain "
							+ "window, so a non-positive value would drain for no time at all");
		}
	}

	/**
	 * How long a pool waits for sends already on a thread before giving up — one socket operation's
	 * budget, for the reasons in this record's Javadoc.
	 */
	public Duration shutdownDrain() {
		return socketTimeout;
	}
}
