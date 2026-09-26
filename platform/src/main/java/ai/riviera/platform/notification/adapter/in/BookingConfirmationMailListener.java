package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.ConfirmationAttemptRecorder;
import ai.riviera.platform.notification.application.ConfirmationSendOutcome;
import ai.riviera.platform.notification.application.MailAttemptOutcome;
import ai.riviera.platform.notification.application.MailAttemptSource;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the booking code on {@link BookingConfirmed}, after commit, via {@link TransactionalMailService}.
 * Keep {@code @Async(MAIL_EXECUTOR)} + {@code @TransactionalEventListener} spelled out (the composite runs on
 * the shared money-path pool), and add no {@code @Transactional}: it would pin a connection across SMTP.
 * Renaming the class, method or parameter type orphans outstanding publications (registry {@code listener_id}).
 * At-least-once, no dedupe table (ADR-0011); a missing fact is skipped, a transport failure propagates. Never
 * log the arrival code (invariant #7). Rationale: RESPONSIBILITIES.md §notification.
 */
@Component
class BookingConfirmationMailListener {

	private static final Logger log = LoggerFactory.getLogger(BookingConfirmationMailListener.class);

	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final ConfirmationAttemptRecorder attempts;
	private final MeterRegistry meters;

	BookingConfirmationMailListener(BookingMailFactsService facts, TransactionalMailService mails,
			ConfirmationAttemptRecorder attempts, MeterRegistry meters) {
		this.facts = facts;
		this.mails = mails;
		this.attempts = attempts;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingConfirmed event) {
		switch (facts.resolve(event.bookingId(), event.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> send(booking, event);
		}
	}

	/**
	 * Send, then record the attempt in the delivery log. A transport failure is recorded <em>before</em> it is
	 * rethrown: the throw keeps the publication outstanding for retry, and the row survives because this
	 * listener holds no transaction.
	 */
	private void send(BookingMailFacts.Resolved booking, BookingConfirmed event) {
		ConfirmationSendOutcome outcome;
		try {
			outcome = mails.sendBookingConfirmation(booking.toEmail(),
					new BookingConfirmationMail(booking.bookingCode(), booking.venueName(),
							event.bookingDate(), event.lastDay(), booking.rowLabel(), booking.positionNo(),
							event.amountMinor(), event.currency(),
							event.cancellationWindowAtBirth(), event.lateCancelRefundBps()));
		}
		catch (RuntimeException e) {
			attempts.recordAttempt(event.bookingId(), MailAttemptSource.AUTOMATIC,
					MailAttemptOutcome.TRANSPORT_FAILED);
			throw e;
		}
		attempts.recordAttempt(event.bookingId(), MailAttemptSource.AUTOMATIC, outcome.recorded());
	}

	/**
	 * Account for a confirmation mail never to be sent: returning normally completes the publication, so the
	 * counter is the only alertable signal and the line the only per-loss record. Ids and reason only — never
	 * the arrival code (invariant #7) or the address.
	 */
	private void abandon(MissingBookingFact fact, BookingConfirmed event) {
		attempts.recordAttempt(event.bookingId(), MailAttemptSource.AUTOMATIC,
				MailAttemptOutcome.ABANDONED_MISSING_FACTS);
		meters.counter(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Booking-confirmation mail abandoned ({}) for booking {} on set {} — the fact cannot "
				+ "appear later, so the publication completes and nothing retries it: a paying tourist "
				+ "has no arrival code by mail", fact.tagValue(), event.bookingId().value(),
				event.setId().value());
	}
}
