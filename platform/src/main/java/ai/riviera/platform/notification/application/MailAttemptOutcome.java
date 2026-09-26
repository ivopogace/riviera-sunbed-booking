package ai.riviera.platform.notification.application;

/**
 * What became of a booking-confirmation mail attempt. Recorded because the Event Publication
 * Registry completes a publication identically for the first three (the listener returns
 * normally); only {@link #TRANSPORT_FAILED} stays outstanding there, the one case that self-heals.
 *
 * <p>The constant names <strong>are</strong> the {@code outcome} tokens V36's {@code CHECK} lists;
 * {@code ConfirmationMailAttemptsIT} pins the lockstep by inserting every one.
 */
public enum MailAttemptOutcome {

	/** Handed to the transport without error. Not a delivery receipt — the relay owns what follows. */
	SENT,

	/** Withheld: the address is on the suppression list, so the module's defining invariant skipped it. */
	WITHHELD_SUPPRESSED,

	/**
	 * The transport threw. On the automatic path the exception also propagates, so the publication
	 * stays outstanding and the registry retries; on an admin resend it is reported back and the admin
	 * can press again.
	 */
	TRANSPORT_FAILED,

	/** Given up on: a booking, set or contact fact the mail needs is missing and cannot appear later. */
	ABANDONED_MISSING_FACTS
}
