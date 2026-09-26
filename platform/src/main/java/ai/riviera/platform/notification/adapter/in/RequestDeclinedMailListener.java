package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the tourist that the venue declined their Request-to-Book. {@code booking} publishes only from
 * the winning decline leg, in the transition's transaction, so never re-read the status here. The code
 * comes through {@code booking::api} and {@link BookingLinks} builds the link at send time, never from
 * the payload the registry persists as text (invariant #7). Async after-commit on the mail bulkhead
 * ({@code MailListenerExecutorArchitectureTest}); a transport failure propagates so the registry
 * retries, while a missing fact is counted, logged at {@code ERROR} and completes the publication.
 */
@Component
class RequestDeclinedMailListener {

	private static final Logger log = LoggerFactory.getLogger(RequestDeclinedMailListener.class);

	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final BookingLinks links;
	private final MeterRegistry meters;

	RequestDeclinedMailListener(BookingMailFactsService facts, TransactionalMailService mails,
			BookingLinks links, MeterRegistry meters) {
		this.facts = facts;
		this.mails = mails;
		this.links = links;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingRequestDeclined event) {
		switch (facts.resolve(event.bookingId(), event.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> mails.sendRequestDeclined(booking.toEmail(),
					new RequestDeclinedMail(booking.bookingCode(), booking.venueName(),
							event.bookingDate(), links.forBooking(booking.bookingCode())));
		}
	}

	/** Ids and the reason only — never the code or the status link that embeds it (invariant #7). */
	private void abandon(MissingBookingFact fact, BookingRequestDeclined event) {
		meters.counter(ObservabilityMetrics.MAIL_REQUEST_DECLINED_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Request-declined mail abandoned ({}) for booking {} on set {} — the fact cannot "
				+ "appear later, so the publication completes and nothing retries it: the guest has no "
				+ "notice the venue declined", fact.tagValue(), event.bookingId().value(),
				event.setId().value());
	}
}
