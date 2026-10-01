package ai.riviera.platform.notification.adapter.in;

import java.util.Optional;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.StayCancelled;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.StayCancellationMailFacts;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails a stitched stay's one cancellation record on {@link StayCancelled}: the stay's code and span with the
 * event's summed refund, on {@link BookingCancellationMailListener}'s terms (after commit, on the mail executor,
 * no {@code @Transactional}, at-least-once, a missing fact skipped and a transport failure propagated).
 * Never log the code (invariant #7).
 */
@Component
class StayCancellationMailListener {

	private static final Logger log = LoggerFactory.getLogger(StayCancellationMailListener.class);

	private final BookingNotificationFacts bookings;
	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final MeterRegistry meters;

	StayCancellationMailListener(BookingNotificationFacts bookings, BookingMailFactsService facts,
			TransactionalMailService mails, MeterRegistry meters) {
		this.bookings = bookings;
		this.facts = facts;
		this.mails = mails;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener(id = "notification.mail-on-stay-cancelled")
	void on(StayCancelled event) {
		Optional<StayConfirmationFacts> stay = bookings.stayConfirmationFacts(event.stayId());
		if (stay.isEmpty()) {
			abandon(MissingBookingFact.NO_BOOKING, event);
			return;
		}
		switch (facts.resolveStayCancellation(stay.get(), event.refundMinor(), event.currency(), event.reason())) {
			case StayCancellationMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case StayCancellationMailFacts.Resolved resolved -> mails.sendBookingCancellation(resolved.toEmail(),
					resolved.mail());
		}
	}

	/** Returning normally completes the publication: the counter and the line are the only record. */
	private void abandon(MissingBookingFact fact, StayCancelled event) {
		meters.counter(ObservabilityMetrics.MAIL_CANCELLATION_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Stay-cancellation mail abandoned ({}) for stay {} — the fact cannot appear later, so nothing "
				+ "retries it: the tourist has no record of the cancellation or its refund", fact.tagValue(),
				event.stayId().value());
	}
}
