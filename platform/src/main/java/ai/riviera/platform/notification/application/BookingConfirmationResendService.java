package ai.riviera.platform.notification.application;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * Resends one booking's confirmation mail and records the attempt (#380) — the same three-port
 * assembly the registry listener uses, driven by an admin instead of by a domain fact.
 *
 * <p><strong>Two refusals before anything is sent.</strong> An unknown id is the admin's mistake; a
 * booking that never reached {@code CONFIRMED} is a stronger reason to stop — the mail says "your
 * booking is confirmed", so sending it for an {@code AWAITING_PAYMENT} or expired request would tell
 * the tourist something untrue and invite them to a venue that is not holding a set for them. Both are
 * reported by name rather than as one generic failure, because the admin's next move differs.
 *
 * <p><strong>Nothing is published.</strong> That is what keeps a resend off every other
 * {@code BookingConfirmed} consumer — {@code payout}'s ledger accrual (invariant #9) and the refund
 * path (invariant #8) cannot run because no event exists, which is a structural guarantee rather than a
 * promise to be careful. It also means no registry row: this send is not retried, and the admin is told
 * so by the outcome.
 *
 * <p><strong>Date, amount and currency are re-read, deliberately.</strong> The listener takes them off
 * the event payload precisely so a later edit cannot rewrite the mail for a past confirmation; a resend
 * has no payload, so it reads the booking's own facts through {@code booking::api}. For a confirmed
 * booking those three are immutable, so the two paths agree.
 */
@Service
class BookingConfirmationResendService implements BookingConfirmationResend {

	private static final Logger log = LoggerFactory.getLogger(BookingConfirmationResendService.class);

	private final BookingNotificationFacts bookings;
	private final BookingMailFactsService mailFacts;
	private final TransactionalMailService mails;
	private final ConfirmationAttemptRecorder attempts;

	BookingConfirmationResendService(BookingNotificationFacts bookings, BookingMailFactsService mailFacts,
			TransactionalMailService mails, ConfirmationAttemptRecorder attempts) {
		this.bookings = bookings;
		this.mailFacts = mailFacts;
		this.mails = mails;
		this.attempts = attempts;
	}

	@Override
	public ResendOutcome resend(BookingId bookingId) {
		Optional<BookingConfirmationFacts> found = bookings.confirmationFacts(bookingId);
		if (found.isEmpty()) {
			return ResendOutcome.NO_SUCH_BOOKING;
		}
		BookingConfirmationFacts booking = found.get();
		if (!booking.everConfirmed()) {
			return ResendOutcome.NOT_CONFIRMED;
		}
		return switch (mailFacts.resolve(bookingId, booking.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(bookingId, fact);
			case BookingMailFacts.Resolved resolved -> sendAndRecord(bookingId, booking, resolved);
		};
	}

	/**
	 * Send, then record — and report a failure rather than throwing it.
	 *
	 * <p>The catch is deliberately as wide as the send: the admin pressed a button and is owed an
	 * answer, so any failure of the send becomes an outcome instead of a {@code 500} that says nothing.
	 * That is the opposite of the automatic path, where the throw is load-bearing (it keeps the
	 * publication outstanding for the registry retry) — here there is no publication to keep, and the
	 * retry is the admin pressing again.
	 */
	private ResendOutcome sendAndRecord(BookingId bookingId, BookingConfirmationFacts booking,
			BookingMailFacts.Resolved resolved) {
		ConfirmationSendOutcome outcome;
		try {
			outcome = mails.sendBookingConfirmation(resolved.toEmail(), new BookingConfirmationMail(
					resolved.bookingCode(), resolved.venueName(), booking.bookingDate(),
					resolved.rowLabel(), resolved.positionNo(), booking.amountMinor(), booking.currency()));
		}
		catch (RuntimeException e) {
			attempts.recordAttempt(bookingId, MailAttemptSource.ADMIN_RESEND,
					MailAttemptOutcome.TRANSPORT_FAILED);
			log.warn("Admin resend of the confirmation mail for booking {} failed ({}); nothing retries "
					+ "it, so the admin is told to try again", bookingId.value(), e.getClass().getSimpleName());
			return ResendOutcome.TRANSPORT_FAILED;
		}
		attempts.recordAttempt(bookingId, MailAttemptSource.ADMIN_RESEND, outcome.recorded());
		return switch (outcome) {
			case SENT -> ResendOutcome.SENT;
			case WITHHELD_SUPPRESSED -> ResendOutcome.WITHHELD_SUPPRESSED;
		};
	}

	/**
	 * The #428 data-integrity fault, reached through the admin path. Recorded like any other attempt so
	 * the history shows the press happened, and named in the outcome so the admin stops pressing.
	 */
	private ResendOutcome abandon(BookingId bookingId, MissingBookingFact fact) {
		attempts.recordAttempt(bookingId, MailAttemptSource.ADMIN_RESEND,
				MailAttemptOutcome.ABANDONED_MISSING_FACTS);
		log.error("Admin resend of the confirmation mail for booking {} abandoned ({}) — the fact cannot "
				+ "appear later, so no press will ever succeed", bookingId.value(), fact.tagValue());
		return ResendOutcome.MISSING_FACTS;
	}
}
