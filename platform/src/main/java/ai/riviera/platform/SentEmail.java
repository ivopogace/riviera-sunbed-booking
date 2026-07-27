package ai.riviera.platform;

import java.net.URI;

/**
 * One email the {@link MockMailer} recorded instead of sending (S8, epic #108; extended for the
 * booking-confirmation kind in #371) — enough for a developer/demo to follow the flow and for backend
 * ITs to complete a verify/reset journey by pulling the tokenized {@link #link} out of the "sent"
 * record, or to assert what a {@link #confirmation} carried. Not used by the real {@link SmtpMailer}.
 *
 * <p>Exactly one of {@link #link} / {@link #confirmation} is populated, per {@link #kind}; use the
 * {@link #recovery} and {@link #bookingConfirmation} factories rather than the canonical constructor
 * so no caller has to remember which slot goes with which kind.
 */
record SentEmail(String toEmail, Kind kind, URI link, BookingConfirmationMail confirmation) {

	/** Which message this is. */
	enum Kind {
		EMAIL_VERIFICATION,
		PASSWORD_RESET,
		BOOKING_CONFIRMATION
	}

	/** A recovery email, identified by its tokenized link (a bearer credential, invariant #7). */
	static SentEmail recovery(String toEmail, Kind kind, URI link) {
		return new SentEmail(toEmail, kind, link, null);
	}

	/** A booking confirmation, identified by the details it renders. */
	static SentEmail bookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		return new SentEmail(toEmail, Kind.BOOKING_CONFIRMATION, null, confirmation);
	}
}
