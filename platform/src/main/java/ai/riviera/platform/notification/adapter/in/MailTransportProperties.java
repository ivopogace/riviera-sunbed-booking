package ai.riviera.platform.notification.adapter.in;

import ai.riviera.platform.shared.ShutdownBudget;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * SMTP per-socket-operation timeout in milliseconds — deliberately not a {@code Duration}:
 * {@code application-mailer.properties} interpolates it textually into all three {@code mail.smtp.*}
 * timeouts ({@code PT10S} there falls back to infinite), and
 * {@link ai.riviera.platform.notification.application.MailTransportBudget} derives both mail pools'
 * drain window from it. Bounded in the compact constructor: non-positive restores Jakarta Mail's
 * infinite timeouts; above {@link #SHUTDOWN_BUDGET_MS} the drain overruns the SIGTERM grace.
 */
@ConfigurationProperties("riviera.notification.mail")
record MailTransportProperties(@DefaultValue("10000") int socketTimeoutMs) {

	/**
	 * This knob's ceiling: each mail pool's claim on the platform's SIGTERM grace, allotted across every
	 * draining pool in {@link ShutdownBudget} (pools drain sequentially, so claims add).
	 */
	static final int SHUTDOWN_BUDGET_MS = ShutdownBudget.MAIL_POOL_CLAIM_MS;

	MailTransportProperties {
		if (socketTimeoutMs <= 0 || socketTimeoutMs > SHUTDOWN_BUDGET_MS) {
			throw new IllegalArgumentException(
					"riviera.notification.mail.socket-timeout-ms must be between 1 and "
							+ SHUTDOWN_BUDGET_MS + ", but was " + socketTimeoutMs
							+ "; it is both the relay's per-operation budget and EACH pool's shutdown drain "
							+ "window, so a non-positive value would restore Jakarta Mail's infinite "
							+ "timeouts (#368) while an oversized one would overspend this module's share "
							+ "of the platform's SIGTERM grace — pools drain SEQUENTIALLY at context "
							+ "close, so the windows add rather than overlap and the process is killed "
							+ "mid-shutdown instead (the whole budget: ShutdownBudget)");
		}
	}
}
