package ai.riviera.platform.notification.adapter.out;

import java.net.URI;

import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.DayRefundMail;
import ai.riviera.platform.notification.application.MoveReminderMail;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;
import ai.riviera.platform.notification.application.StayConfirmationMail;
import ai.riviera.platform.shared.SiteLocale;

/**
 * One email the {@link MockMailer} recorded instead of sending; ITs pull the tokenized {@link #link}
 * out of it or assert on a booking payload. Exactly one slot is populated per {@link #kind}, so build it
 * through the factories, never the canonical constructor. Booking kinds must not share a slot: a
 * confirmation and a payment-due notice carry the same code and venue, and an IT asserting on one must
 * never match the other. {@code locale} is the language the mail was written in (the operator notice's is
 * always English). Public, like the mock, because ITs outside this package read it.
 */
public record SentEmail(String toEmail, Kind kind, URI link, BookingConfirmationMail confirmation,
		BookingCancellationMail cancellation, PaymentDueMail paymentDue,
		RequestDeclinedMail requestDeclined, RequestExpiredMail requestExpired, BookingMovedMail moved,
		StayConfirmationMail stayConfirmation, MoveReminderMail moveReminder, DayRefundMail dayRefund,
		SiteLocale locale) {

	/** Which message this is. */
	public enum Kind {
		EMAIL_VERIFICATION,
		PASSWORD_RESET,
		BOOKING_CONFIRMATION,
		STAY_CONFIRMATION,
		BOOKING_CANCELLATION,
		PAYMENT_DUE,
		OPERATOR_APPROVED,
		REQUEST_DECLINED,
		REQUEST_EXPIRED,
		BOOKING_MOVED,
		MOVE_REMINDER,
		DAY_REFUND
	}

	/** A recovery email, identified by its tokenized link (a bearer credential, invariant #7). */
	static SentEmail recovery(String toEmail, Kind kind, URI link, SiteLocale locale) {
		return new SentEmail(toEmail, kind, link, null, null, null, null, null, null, null, null, null, locale);
	}

	/**
	 * The operator-approval notice. It shares the {@link #link} slot with {@link #recovery} but not its
	 * factory: that link is a bearer credential, this one the public sign-in URL the mock may log.
	 */
	static SentEmail operatorApproved(String toEmail, URI signInLink) {
		return new SentEmail(toEmail, Kind.OPERATOR_APPROVED, signInLink, null, null, null, null, null, null, null, null, null, SiteLocale.EN);
	}

	/** A booking confirmation, identified by the details it renders. */
	static SentEmail bookingConfirmation(String toEmail, SiteLocale locale, BookingConfirmationMail confirmation) {
		return new SentEmail(toEmail, Kind.BOOKING_CONFIRMATION, null, confirmation, null, null, null, null, null, null, null, null, locale);
	}

	/** A stitched stay's one confirmation, identified by the details it renders. */
	static SentEmail stayConfirmation(String toEmail, SiteLocale locale, StayConfirmationMail confirmation) {
		return new SentEmail(toEmail, Kind.STAY_CONFIRMATION, null, null, null, null, null, null, null, confirmation, null, null, locale);
	}

	/** A cancellation/refund record, identified by the details it renders. */
	static SentEmail bookingCancellation(String toEmail, SiteLocale locale, BookingCancellationMail cancellation) {
		return new SentEmail(toEmail, Kind.BOOKING_CANCELLATION, null, null, cancellation, null, null, null, null, null, null, null, locale);
	}

	/**
	 * An accepted request's payment-due notice. Its {@code payLink} rides the payload, never the
	 * {@link #link} slot, which the recovery ITs follow blindly as a token exchange.
	 */
	static SentEmail paymentDue(String toEmail, SiteLocale locale, PaymentDueMail paymentDue) {
		return new SentEmail(toEmail, Kind.PAYMENT_DUE, null, null, null, paymentDue, null, null, null, null, null, null, locale);
	}

	/** A declined request's record; its {@code statusLink} rides the payload, like the pay link. */
	static SentEmail requestDeclined(String toEmail, SiteLocale locale, RequestDeclinedMail declined) {
		return new SentEmail(toEmail, Kind.REQUEST_DECLINED, null, null, null, null, declined, null, null, null, null, null, locale);
	}

	/** An expired request's record, on the declined kind's rules. */
	static SentEmail requestExpired(String toEmail, SiteLocale locale, RequestExpiredMail expired) {
		return new SentEmail(toEmail, Kind.REQUEST_EXPIRED, null, null, null, null, null, expired, null, null, null, null, locale);
	}

	/** A changed-spot notice; its {@code bookingLink} rides the payload, like the pay and status links. */
	static SentEmail bookingMoved(String toEmail, SiteLocale locale, BookingMovedMail moved) {
		return new SentEmail(toEmail, Kind.BOOKING_MOVED, null, null, null, null, null, null, moved, null, null, null, locale);
	}

	/** The evening-before move reminder; its {@code bookingLink} rides the payload, as the move's does. */
	static SentEmail moveReminder(String toEmail, SiteLocale locale, MoveReminderMail reminder) {
		return new SentEmail(toEmail, Kind.MOVE_REMINDER, null, null, null, null, null, null, null, null, reminder, null, locale);
	}

	static SentEmail dayRefund(String toEmail, SiteLocale locale, DayRefundMail refund) {
		return new SentEmail(toEmail, Kind.DAY_REFUND, null, null, null, null, null, null, null, null, null, refund, locale);
	}
}
