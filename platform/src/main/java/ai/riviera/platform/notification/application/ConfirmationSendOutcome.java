package ai.riviera.platform.notification.application;

/**
 * What the send chokepoint did with a booking-confirmation mail (#380) — exactly two answers, because
 * exactly two things can happen once the facts are in hand and the transport has not thrown.
 *
 * <p>Until #380 this was discarded: {@code sendBookingConfirmation} returned {@code void}, so a
 * deliberate withholding was indistinguishable from a delivery at every call site. That mattered more
 * than it looked, because the Event Publication Registry cannot tell them apart either — it completes
 * the publication for both — which is why this return value, and not {@code completion_date}, is where
 * the difference lives.
 *
 * <p>Narrower than {@link MailAttemptOutcome} on purpose: the chokepoint can never answer
 * {@code TRANSPORT_FAILED} (it throws instead, so the registry retries) or
 * {@code ABANDONED_MISSING_FACTS} (the send is never reached). {@link #recorded()} widens it for the
 * log so neither caller has to spell the mapping twice.
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
