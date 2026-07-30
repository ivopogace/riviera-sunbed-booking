package ai.riviera.platform.notification.application;

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
	 * <p>"Once" is this method's responsibility, not the framework's: {@code markResubmitted} is
	 * documented as a claim that fails when another instance got there first, but it is a
	 * {@code default} method returning {@code true} that the JDBC repository does not override, so two
	 * clicks would otherwise both proceed and both send (#405 finding 2). See
	 * {@link MailResubmissionOutcome.AlreadyRunning} and {@link MailResubmissionOutcome.CoolingDown}
	 * for the two halves of the guard.
	 */
	MailResubmissionOutcome resubmit();
}
