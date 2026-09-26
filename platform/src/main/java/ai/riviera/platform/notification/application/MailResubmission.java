package ai.riviera.platform.notification.application;

import ai.riviera.platform.shared.ResubmissionOutcome;

/**
 * The driving port behind the ADMIN mail-outbox surface: what the registry still owes this module,
 * and an on-demand re-drive of it. A failed send stays owed (its publication keeps
 * {@code completion_date = NULL}), but otherwise only a restart's
 * {@code republish-outstanding-events-on-restart} retries it. This is that trigger and nothing
 * more: delivery, suppression and transport are untouched. Internal, not published: only this
 * module's admin adapter calls it.
 */
public interface MailResubmission {

	/** What the console shows before anyone presses anything. */
	MailOutboxStatus status();

	/**
	 * Re-drive every outstanding publication in scope, once: the v2 registry's
	 * {@code markResubmitted} claim skips one still in flight; this port bounds how often the scope
	 * is swept, refusing with {@link ResubmissionOutcome.AlreadyRunning} or {@code CoolingDown}.
	 */
	ResubmissionOutcome resubmit();
}
