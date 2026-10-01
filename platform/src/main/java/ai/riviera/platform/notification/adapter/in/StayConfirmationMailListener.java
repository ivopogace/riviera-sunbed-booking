package ai.riviera.platform.notification.adapter.in;

import java.util.List;
import java.util.Optional;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.StayConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.ConfirmationAttemptRecorder;
import ai.riviera.platform.notification.application.ConfirmationSendOutcome;
import ai.riviera.platform.notification.application.MailAttemptOutcome;
import ai.riviera.platform.notification.application.MailAttemptSource;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.StayMailFacts;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.monitoring.vocabulary.ObservabilityMetrics;

/**
 * Mails a stitched stay's one confirmation on {@link StayConfirmed}, on {@link BookingConfirmationMailListener}'s
 * terms (after commit, on the mail executor, no {@code @Transactional}, at-least-once, a missing fact
 * skipped and a transport failure propagated). The attempt
 * is logged on every stretch the mail covers. Never log the code (invariant #7).
 */
@Component
class StayConfirmationMailListener {

	private static final Logger log = LoggerFactory.getLogger(StayConfirmationMailListener.class);

	private final BookingNotificationFacts bookings;
	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final ConfirmationAttemptRecorder attempts;
	private final MeterRegistry meters;

	StayConfirmationMailListener(BookingNotificationFacts bookings, BookingMailFactsService facts,
			TransactionalMailService mails, ConfirmationAttemptRecorder attempts, MeterRegistry meters) {
		this.bookings = bookings;
		this.facts = facts;
		this.mails = mails;
		this.attempts = attempts;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener(id = "notification.mail-on-stay-confirmed")
	void on(StayConfirmed event) {
		Optional<StayConfirmationFacts> stay = bookings.stayConfirmationFacts(event.stayId());
		if (stay.isEmpty()) {
			abandon(MissingBookingFact.NO_BOOKING, List.of(), event);
			return;
		}
		List<BookingId> stretches = stay.get().stops().stream().map(StayConfirmationFacts.Stop::bookingId).toList();
		switch (facts.resolveStay(stay.get(), event.cancellationWindowAtBirth(), event.lateCancelRefundBps())) {
			case StayMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, stretches, event);
			case StayMailFacts.Resolved resolved -> send(resolved, stretches);
		}
	}

	/** Send, then record; a transport failure is recorded before it is rethrown to keep the publication open. */
	private void send(StayMailFacts.Resolved stay, List<BookingId> stretches) {
		ConfirmationSendOutcome outcome;
		try {
			outcome = mails.sendStayConfirmation(stay.toEmail(), stay.mail());
		}
		catch (RuntimeException e) {
			attempts.recordAttempts(stretches, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.TRANSPORT_FAILED);
			throw e;
		}
		attempts.recordAttempts(stretches, MailAttemptSource.AUTOMATIC, outcome.recorded());
	}

	/** Returning normally completes the publication: the counter and the line are the only record. */
	private void abandon(MissingBookingFact fact, List<BookingId> stretches, StayConfirmed event) {
		attempts.recordAttempts(stretches, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.ABANDONED_MISSING_FACTS);
		meters.counter(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Stay-confirmation mail abandoned ({}) for stay {} — the fact cannot appear later, so nothing "
				+ "retries it: a paying tourist has no arrival code by mail", fact.tagValue(), event.stayId().value());
	}
}
