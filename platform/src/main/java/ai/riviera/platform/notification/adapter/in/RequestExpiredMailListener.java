package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingRequestExpired;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.RequestExpiredMail;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the tourist a record that their Request-to-Book expired unanswered (#124) —
 * {@link RequestDeclinedMailListener}'s mirror for the sweep's fact, and everything argued there
 * applies unchanged: warranted-upstream ({@code booking} publishes only from the winning expire
 * leg, one per expired row, so a clean sweep reaches this class zero times), the shared three-port
 * assembly, the send-time status link (invariant #7), the mail bulkhead, registry-whole
 * idempotency, and a per-loss {@code ERROR} under this flow's own counter,
 * {@link ObservabilityMetrics#MAIL_REQUEST_EXPIRED_ABANDONED}.
 */
@Component
class RequestExpiredMailListener {

	private static final Logger log = LoggerFactory.getLogger(RequestExpiredMailListener.class);

	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final BookingLinks links;
	private final MeterRegistry meters;

	RequestExpiredMailListener(BookingMailFactsService facts, TransactionalMailService mails,
			BookingLinks links, MeterRegistry meters) {
		this.facts = facts;
		this.mails = mails;
		this.links = links;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingRequestExpired event) {
		switch (facts.resolve(event.bookingId(), event.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> mails.sendRequestExpired(booking.toEmail(),
					new RequestExpiredMail(booking.bookingCode(), booking.venueName(),
							event.bookingDate(), links.forBooking(booking.bookingCode())));
		}
	}

	/** Ids and the reason only — never the code or the status link that embeds it (invariant #7). */
	private void abandon(MissingBookingFact fact, BookingRequestExpired event) {
		meters.counter(ObservabilityMetrics.MAIL_REQUEST_EXPIRED_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Request-expired mail abandoned ({}) for booking {} on set {} — the fact cannot "
				+ "appear later, so the publication completes and nothing retries it: the guest has no "
				+ "notice their request expired", fact.tagValue(), event.bookingId().value(),
				event.setId().value());
	}
}
