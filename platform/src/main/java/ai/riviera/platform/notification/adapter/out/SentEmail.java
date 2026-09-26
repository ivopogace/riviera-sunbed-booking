package ai.riviera.platform.notification.adapter.out;

import java.net.URI;

import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;

/**
 * One email the {@link MockMailer} recorded instead of sending; ITs pull the tokenized {@link #link}
 * out of it or assert on a booking payload. Exactly one slot is populated per {@link #kind}, so build it
 * through the factories, never the canonical constructor. Booking kinds must not share a slot: a
 * confirmation and a payment-due notice carry the same code and venue, and an IT asserting on one must
 * never match the other. Public, like the mock, because ITs outside this package read it.
 */
public record SentEmail(String toEmail, Kind kind, URI link, BookingConfirmationMail confirmation,
		BookingCancellationMail cancellation, PaymentDueMail paymentDue,
		RequestDeclinedMail requestDeclined, RequestExpiredMail requestExpired, BookingMovedMail moved) {

	/** Which message this is. */
	public enum Kind {
		EMAIL_VERIFICATION,
		PASSWORD_RESET,
		BOOKING_CONFIRMATION,
		BOOKING_CANCELLATION,
		PAYMENT_DUE,
		OPERATOR_APPROVED,
		REQUEST_DECLINED,
		REQUEST_EXPIRED,
		BOOKING_MOVED
	}

	/** A recovery email, identified by its tokenized link (a bearer credential, invariant #7). */
	static SentEmail recovery(String toEmail, Kind kind, URI link) {
		return new SentEmail(toEmail, kind, link, null, null, null, null, null, null);
	}

	/**
	 * The operator-approval notice. It shares the {@link #link} slot with {@link #recovery} but not its
	 * factory: that link is a bearer credential, this one the public sign-in URL the mock may log.
	 */
	static SentEmail operatorApproved(String toEmail, URI signInLink) {
		return new SentEmail(toEmail, Kind.OPERATOR_APPROVED, signInLink, null, null, null, null, null, null);
	}

	/** A booking confirmation, identified by the details it renders. */
	static SentEmail bookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		return new SentEmail(toEmail, Kind.BOOKING_CONFIRMATION, null, confirmation, null, null, null, null, null);
	}

	/** A cancellation/refund record, identified by the details it renders. */
	static SentEmail bookingCancellation(String toEmail, BookingCancellationMail cancellation) {
		return new SentEmail(toEmail, Kind.BOOKING_CANCELLATION, null, null, cancellation, null, null, null, null);
	}

	/**
	 * An accepted request's payment-due notice. Its {@code payLink} rides the payload, never the
	 * {@link #link} slot, which the recovery ITs follow blindly as a token exchange.
	 */
	static SentEmail paymentDue(String toEmail, PaymentDueMail paymentDue) {
		return new SentEmail(toEmail, Kind.PAYMENT_DUE, null, null, null, paymentDue, null, null, null);
	}

	/** A declined request's record; its {@code statusLink} rides the payload, like the pay link. */
	static SentEmail requestDeclined(String toEmail, RequestDeclinedMail declined) {
		return new SentEmail(toEmail, Kind.REQUEST_DECLINED, null, null, null, null, declined, null, null);
	}

	/** An expired request's record, on the declined kind's rules. */
	static SentEmail requestExpired(String toEmail, RequestExpiredMail expired) {
		return new SentEmail(toEmail, Kind.REQUEST_EXPIRED, null, null, null, null, null, expired, null);
	}

	/** A changed-spot notice; its {@code bookingLink} rides the payload, like the pay and status links. */
	static SentEmail bookingMoved(String toEmail, BookingMovedMail moved) {
		return new SentEmail(toEmail, Kind.BOOKING_MOVED, null, null, null, null, null, null, moved);
	}
}
