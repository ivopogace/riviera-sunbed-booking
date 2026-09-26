package ai.riviera.platform.notification.application;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * Resends one booking's confirmation mail for an admin and records the attempt. Refuses, each by name,
 * an unknown id and a booking that never reached {@code CONFIRMED}: the mail would tell the tourist
 * something untrue. Publishes nothing, so no other {@code BookingConfirmed} consumer ({@code payout}'s
 * ledger accrual, invariant #9) re-runs and nothing retries a failed send. Date, amount and currency are
 * re-read through {@code booking::api}, not taken off a payload; immutable once confirmed, they match.
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
	 * Send, then record; any send failure becomes an outcome, never a {@code 500}. Unlike the registry
	 * listener, whose throw keeps the publication outstanding for retry, there is nothing to keep here:
	 * the retry is the admin pressing again.
	 */
	private ResendOutcome sendAndRecord(BookingId bookingId, BookingConfirmationFacts booking,
			BookingMailFacts.Resolved resolved) {
		ConfirmationSendOutcome outcome;
		try {
			outcome = mails.sendBookingConfirmation(resolved.toEmail(), new BookingConfirmationMail(
					resolved.bookingCode(), resolved.venueName(), booking.bookingDate(), booking.lastDate(),
					resolved.rowLabel(), resolved.positionNo(), booking.amountMinor(), booking.currency(),
					booking.cancellationWindowAtBirth(), booking.lateCancelRefundBps()));
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
	 * The missing-booking-fact data-integrity fault, reached through the admin path. Recorded like any
	 * other attempt so the history shows the press happened, and named in the outcome so the admin
	 * stops pressing.
	 */
	private ResendOutcome abandon(BookingId bookingId, MissingBookingFact fact) {
		attempts.recordAttempt(bookingId, MailAttemptSource.ADMIN_RESEND,
				MailAttemptOutcome.ABANDONED_MISSING_FACTS);
		log.error("Admin resend of the confirmation mail for booking {} abandoned ({}) — the fact cannot "
				+ "appear later, so no press will ever succeed", bookingId.value(), fact.tagValue());
		return ResendOutcome.MISSING_FACTS;
	}
}
