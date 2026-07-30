package ai.riviera.platform.notification.adapter.out;

import java.net.URI;

import ai.riviera.platform.notification.application.BookingConfirmationMail;

/**
 * One email the {@link MockMailer} recorded instead of sending (S8, epic #108; extended for the
 * booking-confirmation kind in #371) — enough for a developer/demo to follow the flow and for backend
 * ITs to complete a verify/reset journey by pulling the tokenized {@link #link} out of the "sent"
 * record, or to assert what a {@link #confirmation} carried. Not used by the real {@link SmtpMailer}.
 *
 * <p>Exactly one of {@link #link} / {@link #confirmation} is populated, per {@link #kind}; use the
 * {@link #recovery} and {@link #bookingConfirmation} factories rather than the canonical constructor
 * so no caller has to remember which slot goes with which kind. Public alongside {@link MockMailer}
 * (#382): it is the value the mock's observation seam speaks to ITs outside this package.
 */
public record SentEmail(String toEmail, Kind kind, URI link, BookingConfirmationMail confirmation) {

	/** Which message this is. */
	public enum Kind {
		EMAIL_VERIFICATION,
		PASSWORD_RESET,
		BOOKING_CONFIRMATION,
		OPERATOR_APPROVED
	}

	/** A recovery email, identified by its tokenized link (a bearer credential, invariant #7). */
	static SentEmail recovery(String toEmail, Kind kind, URI link) {
		return new SentEmail(toEmail, kind, link, null);
	}

	/**
	 * The operator-approval notice, identified by its sign-in link. It shares the {@link #link} slot
	 * with {@link #recovery} but deliberately not its factory: that link is a bearer credential and
	 * this one is the ordinary sign-in URL, and one factory for both would erase the distinction the
	 * mock's logging rules turn on.
	 */
	static SentEmail operatorApproved(String toEmail, URI signInLink) {
		return new SentEmail(toEmail, Kind.OPERATOR_APPROVED, signInLink, null);
	}

	/** A booking confirmation, identified by the details it renders. */
	static SentEmail bookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		return new SentEmail(toEmail, Kind.BOOKING_CONFIRMATION, null, confirmation);
	}
}
