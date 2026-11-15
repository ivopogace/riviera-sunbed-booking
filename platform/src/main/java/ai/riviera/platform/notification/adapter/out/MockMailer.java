package ai.riviera.platform.notification.adapter.out;

import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.DayRefundMail;
import ai.riviera.platform.notification.application.MoveReminderMail;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;
import ai.riviera.platform.notification.application.StayConfirmationMail;
import ai.riviera.platform.shared.SiteLocale;

/**
 * Recording {@link Mailer}: keeps each {@link SentEmail} in memory instead of sending, so every kind
 * is demoable without credentials. The profile keeps exactly one {@code Mailer} bean ({@link SmtpMailer}
 * under {@code mailer}/{@code smtp4dev}); {@link MockMailerProdGuard} refuses this one without {@code demo}:
 * it logs recovery links, whose token is a bearer credential (invariant #7), as a dev-only affordance.
 * Booking kinds log no code or link. Public only for ITs ({@link #sent()}, {@link #lastTo},
 * {@link #clear()}): Modulith walls it off, and callers reach only {@code notification::api}/{@code ::vocabulary}.
 */
@Component
@Profile("!mailer & !smtp4dev")
public class MockMailer implements Mailer {

	private static final Logger log = LoggerFactory.getLogger(MockMailer.class);

	/** The kind/recipient/venue/date line the code-free booking records share (riviera-java-conventions §6a). */
	private static final String BOOKING_RECORD_LOG = "[mock-mailer] {} (to {}) for {} on {}";

	private final List<SentEmail> sent = new CopyOnWriteArrayList<>();

	@Override
	public void sendEmailVerification(String toEmail, SiteLocale locale, URI verificationLink) {
		SentEmail email = SentEmail.recovery(toEmail, SentEmail.Kind.EMAIL_VERIFICATION, verificationLink, locale);
		sent.add(email);
		logRecovery(email);
	}

	@Override
	public void sendPasswordReset(String toEmail, SiteLocale locale, URI resetLink) {
		SentEmail email = SentEmail.recovery(toEmail, SentEmail.Kind.PASSWORD_RESET, resetLink, locale);
		sent.add(email);
		logRecovery(email);
	}

	@Override
	public void sendBookingConfirmation(String toEmail, SiteLocale locale, BookingConfirmationMail confirmation) {
		sent.add(SentEmail.bookingConfirmation(toEmail, locale, confirmation));
		// No code in the line: unlike a recovery link, the arrival code needs no dev affordance — the
		// tourist already has it in the app — so invariant #7 costs nothing here.
		log.info(BOOKING_RECORD_LOG, SentEmail.Kind.BOOKING_CONFIRMATION,
				sanitize(toEmail), sanitize(confirmation.venueName()), confirmation.bookingDate());
	}

	@Override
	public void sendStayConfirmation(String toEmail, SiteLocale locale, StayConfirmationMail confirmation) {
		sent.add(SentEmail.stayConfirmation(toEmail, locale, confirmation));
		log.info(BOOKING_RECORD_LOG, SentEmail.Kind.STAY_CONFIRMATION,
				sanitize(toEmail), sanitize(confirmation.venueName()), confirmation.firstDate());
	}

	@Override
	public void sendBookingCancellation(String toEmail, SiteLocale locale, BookingCancellationMail cancellation) {
		sent.add(SentEmail.bookingCancellation(toEmail, locale, cancellation));
		// No code in the line, for the confirmation's reason: mailing it is the point, logging it is not.
		log.info("[mock-mailer] {} (to {}) for {} on {} — refund {} {} ({})",
				SentEmail.Kind.BOOKING_CANCELLATION, sanitize(toEmail), sanitize(cancellation.venueName()),
				cancellation.bookingDate(), cancellation.refundMinor(), cancellation.currency(),
				cancellation.reason());
	}

	@Override
	public void sendPaymentDue(String toEmail, SiteLocale locale, PaymentDueMail paymentDue) {
		sent.add(SentEmail.paymentDue(toEmail, locale, paymentDue));
		// Neither the code nor the pay link that embeds it: the link reaches an unpaid booking.
		log.info("[mock-mailer] {} (to {}) for {} on {} — {} {} due by {}", SentEmail.Kind.PAYMENT_DUE,
				sanitize(toEmail), sanitize(paymentDue.venueName()), paymentDue.bookingDate(),
				paymentDue.currency(), paymentDue.amountMinor(), paymentDue.payBy());
	}

	@Override
	public void sendRequestDeclined(String toEmail, SiteLocale locale, RequestDeclinedMail declined) {
		sent.add(SentEmail.requestDeclined(toEmail, locale, declined));
		// Neither the code nor the status link that embeds it (invariant #7) — the confirmation's rule.
		log.info(BOOKING_RECORD_LOG, SentEmail.Kind.REQUEST_DECLINED,
				sanitize(toEmail), sanitize(declined.venueName()), declined.bookingDate());
	}

	@Override
	public void sendRequestExpired(String toEmail, SiteLocale locale, RequestExpiredMail expired) {
		sent.add(SentEmail.requestExpired(toEmail, locale, expired));
		log.info(BOOKING_RECORD_LOG, SentEmail.Kind.REQUEST_EXPIRED,
				sanitize(toEmail), sanitize(expired.venueName()), expired.bookingDate());
	}

	@Override
	public void sendBookingMoved(String toEmail, SiteLocale locale, BookingMovedMail moved) {
		sent.add(SentEmail.bookingMoved(toEmail, locale, moved));
		// Neither the code nor the booking link that embeds it (invariant #7) — the confirmation's rule.
		log.info("[mock-mailer] {} (to {}) for {} on {} — {}{} to {}{}", SentEmail.Kind.BOOKING_MOVED,
				sanitize(toEmail), sanitize(moved.venueName()), moved.bookingDate(), moved.fromRowLabel(),
				moved.fromPositionNo(), moved.toRowLabel(), moved.toPositionNo());
	}

	@Override
	public void sendMoveReminder(String toEmail, SiteLocale locale, MoveReminderMail reminder) {
		sent.add(SentEmail.moveReminder(toEmail, locale, reminder));
		log.info("[mock-mailer] {} (to {}) for {} on {} — {}{} to {}{}", SentEmail.Kind.MOVE_REMINDER,
				sanitize(toEmail), sanitize(reminder.venueName()), reminder.moveDate(), reminder.fromRowLabel(),
				reminder.fromPositionNo(), reminder.toRowLabel(), reminder.toPositionNo());
	}

	@Override
	public void sendDayRefund(String toEmail, SiteLocale locale, DayRefundMail refund) {
		sent.add(SentEmail.dayRefund(toEmail, locale, refund));
		// No code in the line, for the cancellation's reason: mailing it is the point, logging it is not.
		log.info("[mock-mailer] {} (to {}) for {} on {} — refund {} {}", SentEmail.Kind.DAY_REFUND,
				sanitize(toEmail), sanitize(refund.venueName()), refund.serviceDate(), refund.refundMinor(),
				refund.currency());
	}

	@Override
	public void sendOperatorApproved(String toEmail, SiteLocale locale, URI signInLink) {
		SentEmail email = SentEmail.operatorApproved(toEmail, locale, signInLink);
		sent.add(email);
		// Logged like a recovery link but for the opposite reason: this URL is public, not a credential.
		log.info("[mock-mailer] {} link (to {}): {}", email.kind(), sanitize(toEmail), signInLink);
	}

	private void logRecovery(SentEmail email) {
		// Dev-only convenience (design D-6): follow the tokenized link without a real inbox. The email is
		// user-supplied, so neutralize newlines before logging (log-forging, riviera-java-conventions §10).
		log.info("[mock-mailer] {} link (to {}): {}", email.kind(), sanitize(email.toEmail()), email.link());
	}

	/** Every email recorded so far, oldest first (test/demo inspection). */
	public List<SentEmail> sent() {
		return List.copyOf(sent);
	}

	/** The most recent email recorded for this address, or empty if none (IT helper). */
	public Optional<SentEmail> lastTo(String toEmail) {
		return sent.stream().filter(e -> e.toEmail().equals(toEmail)).reduce((first, second) -> second);
	}

	/** Reset the recorded outbox — lets an IT isolate the email its own step produced. */
	public void clear() {
		sent.clear();
	}

	private static String sanitize(String value) {
		return value.replaceAll("[\\r\\n]", "_");
	}
}
