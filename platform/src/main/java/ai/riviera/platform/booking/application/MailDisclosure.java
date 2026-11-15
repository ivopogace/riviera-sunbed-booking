package ai.riviera.platform.booking.application;

/**
 * What a reader of a booking may be told about its confirmation mail, decided by {@link ConfirmationMailDisclosure}.
 * {@code UNDISCLOSED} is every reader but the address's verified owner, whatever the suppression list holds.
 */
public enum MailDisclosure {

	/** Nothing about this address: the reader is told only that a mail is on its way. */
	UNDISCLOSED,

	/** The verified owner's address is deliverable, so the confirmation went out. */
	EMAILED,

	/** The verified owner's address is suppressed, so the confirmation was withheld. */
	WITHHELD
}
