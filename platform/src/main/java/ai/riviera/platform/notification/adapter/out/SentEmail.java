package ai.riviera.platform.notification.adapter.out;

import java.net.URI;

import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;

/**
 * One email the {@link MockMailer} recorded instead of sending (S8, epic #108; extended for the
 * booking-confirmation kind in #371 and the cancellation kind in #374) — enough for a developer/demo
 * to follow the flow and for backend ITs to complete a verify/reset journey by pulling the tokenized
 * {@link #link} out of the "sent" record, or to assert what a {@link #confirmation} or
 * {@link #cancellation} carried. Not used by the real {@link SmtpMailer}.
 *
 * <p>Exactly one of {@link #link} / {@link #confirmation} / {@link #cancellation} / {@link #paymentDue}
 * is populated, per {@link #kind}; use the {@link #recovery}, {@link #bookingConfirmation},
 * {@link #bookingCancellation} and {@link #paymentDue(String, PaymentDueMail)} factories rather than
 * the canonical constructor so no caller has to
 * remember which slot goes with which kind. The three booking kinds deliberately do <em>not</em> share
 * a slot: an IT asserting on a confirmation must not silently match a cancellation, which is exactly
 * what a shared {@code Object} payload would allow — and #373's payment-due mail is the case that
 * makes the rule bite, since it carries the same code and venue as the confirmation for the same
 * booking and says the opposite thing about the money. Public alongside {@link MockMailer} (#382): it is
 * the value the mock's observation seam speaks to ITs outside this package.
 */
public record SentEmail(String toEmail, Kind kind, URI link, BookingConfirmationMail confirmation,
		BookingCancellationMail cancellation, PaymentDueMail paymentDue,
		RequestDeclinedMail requestDeclined, RequestExpiredMail requestExpired) {

	/** Which message this is. */
	public enum Kind {
		EMAIL_VERIFICATION,
		PASSWORD_RESET,
		BOOKING_CONFIRMATION,
		BOOKING_CANCELLATION,
		PAYMENT_DUE,
		OPERATOR_APPROVED,
		REQUEST_DECLINED,
		REQUEST_EXPIRED
	}

	/** A recovery email, identified by its tokenized link (a bearer credential, invariant #7). */
	static SentEmail recovery(String toEmail, Kind kind, URI link) {
		return new SentEmail(toEmail, kind, link, null, null, null, null, null);
	}

	/**
	 * The operator-approval notice, identified by its sign-in link. It shares the {@link #link} slot
	 * with {@link #recovery} but deliberately not its factory: that link is a bearer credential and
	 * this one is the ordinary sign-in URL, and one factory for both would erase the distinction the
	 * mock's logging rules turn on.
	 */
	static SentEmail operatorApproved(String toEmail, URI signInLink) {
		return new SentEmail(toEmail, Kind.OPERATOR_APPROVED, signInLink, null, null, null, null, null);
	}

	/** A booking confirmation, identified by the details it renders. */
	static SentEmail bookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		return new SentEmail(toEmail, Kind.BOOKING_CONFIRMATION, null, confirmation, null, null, null, null);
	}

	/** A cancellation/refund record, identified by the details it renders. */
	static SentEmail bookingCancellation(String toEmail, BookingCancellationMail cancellation) {
		return new SentEmail(toEmail, Kind.BOOKING_CANCELLATION, null, null, cancellation, null, null, null);
	}

	/**
	 * An accepted request's payment-due notice, identified by the details it renders (#373). Its
	 * {@code payLink} lives on the payload rather than in the shared {@link #link} slot, so an IT
	 * reaching for a recovery link can never match it: that slot's occupants are followed blindly by
	 * the recovery ITs, and this URL leads to a booking, not a token exchange.
	 */
	static SentEmail paymentDue(String toEmail, PaymentDueMail paymentDue) {
		return new SentEmail(toEmail, Kind.PAYMENT_DUE, null, null, null, paymentDue, null, null);
	}

	/** A declined request's record (#124); its {@code statusLink} rides the payload, like the pay link. */
	static SentEmail requestDeclined(String toEmail, RequestDeclinedMail declined) {
		return new SentEmail(toEmail, Kind.REQUEST_DECLINED, null, null, null, null, declined, null);
	}

	/** An expired request's record (#124), on the declined kind's rules. */
	static SentEmail requestExpired(String toEmail, RequestExpiredMail expired) {
		return new SentEmail(toEmail, Kind.REQUEST_EXPIRED, null, null, null, null, null, expired);
	}
}
