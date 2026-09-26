package ai.riviera.platform.notification.api;

/**
 * Whether a transactional mail to an address would be <strong>withheld</strong> as suppressed
 * <em>now</em>: a present-tense answer, not the record of a past send. A separate port, never a return
 * value on {@link MailSender}, whose sends must move neither a response's status nor its latency. Only
 * safe where the caller owns the address: from an anonymous surface it is an enumeration and timing
 * oracle. Never throws for an operational failure; an unanswerable lookup reports {@code false}.
 * Rationale: {@code RESPONSIBILITIES.md} §notification.
 */
public interface MailDeliverability {

	/** Whether a mail to this address would be withheld right now because the address is suppressed. */
	boolean isWithheld(String toEmail);
}
