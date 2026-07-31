package ai.riviera.platform.notification.application;

import ai.riviera.platform.shared.ResubmissionOutcome;

/**
 * The driving port behind the ADMIN mail-outbox surface (#405): read what the registry still owes this
 * module, and re-drive it on demand.
 *
 * <p><strong>Why this exists at all.</strong> The failure path was already correct — a transport
 * exception propagates, the publication keeps {@code completion_date = NULL}, and the mail is durably
 * owed — but the <em>only</em> thing that ever retried it was an application restart
 * ({@code republish-outstanding-events-on-restart}, fired once from
 * {@code afterSingletonsInstantiated}). On Render that made the retry horizon "the next deploy", which
 * could be days. This port is that trigger, and nothing more: delivery, suppression and transport are
 * untouched.
 *
 * <p><strong>Internal, not published.</strong> Its only caller is this module's own admin adapter, so
 * publishing it would add a third {@code notification::api} surface for a hypothetical seam — the same
 * argument that kept {@code AdminEmailSuppressionController} inside the module in #391.
 */
public interface MailResubmission {

	/** What the console shows before anyone presses anything. */
	MailOutboxStatus status();

	/**
	 * Re-drive every outstanding publication in scope, once.
	 *
	 * <p>"Once" is shared between two layers, and the durable half is the registry's: its
	 * {@code markResubmitted} claim skips a publication whose previous resubmission is still in flight
	 * (v2 repository — #405 describes the v1 one, where that method is an unoverridden {@code default}).
	 * What this port adds is a bound on how often the whole scope is swept, and a caller-visible reason
	 * when it refuses — see {@link ResubmissionOutcome.AlreadyRunning} and
	 * {@link ResubmissionOutcome.CoolingDown}.
	 */
	ResubmissionOutcome resubmit();
}
