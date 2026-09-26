package ai.riviera.platform.notification.application;

/**
 * What the send chokepoint did with a booking-confirmation mail. The only place a withholding
 * differs from a delivery: the Event Publication Registry completes the publication for both.
 *
 * <p>Narrower than {@link MailAttemptOutcome}: the chokepoint throws on a transport failure (so
 * the registry retries) and is never reached with missing facts. {@link #recorded()} widens it
 * for the log.
 */
public enum ConfirmationSendOutcome {

	/** Handed to the transport without error. */
	SENT,

	/** Withheld: the address is suppressed, so the module's defining invariant skipped the send. */
	WITHHELD_SUPPRESSED;

	/** How this outcome reads in the delivery log. */
	public MailAttemptOutcome recorded() {
		return switch (this) {
			case SENT -> MailAttemptOutcome.SENT;
			case WITHHELD_SUPPRESSED -> MailAttemptOutcome.WITHHELD_SUPPRESSED;
		};
	}
}
