package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.DayRefundMail;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the guest a refunded day's record on {@link BookingDayRefunded} (ADR-0026, ADR-0027): the day, the
 * payload's server-computed refund (#10, #5), its reason and released mark, and the code-gated link, under
 * the stay's code for a stretch. The link is built after the code resolves, so the event stays ids-only (#7).
 * On {@code BookingCancellationMailListener}'s terms: after commit, on the mail executor, no
 * {@code @Transactional}, at-least-once, a missing fact abandoned under
 * {@link ObservabilityMetrics#MAIL_DAY_REFUND_ABANDONED}, a transport failure propagated.
 */
@Component
class BookingDayRefundMailListener {

	private static final Logger log = LoggerFactory.getLogger(BookingDayRefundMailListener.class);

	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final BookingLinks links;
	private final MeterRegistry meters;

	BookingDayRefundMailListener(BookingMailFactsService facts, TransactionalMailService mails, BookingLinks links,
			MeterRegistry meters) {
		this.facts = facts;
		this.mails = mails;
		this.links = links;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingDayRefunded event) {
		switch (facts.resolve(event.bookingId(), event.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> mails.sendDayRefund(booking.toEmail(),
					new DayRefundMail(booking.bookingCode(), booking.venueName(), event.serviceDate(),
							event.refundMinor(), event.currency(), event.refundReason(), event.released(),
							links.forBooking(booking.bookingCode())));
		}
	}

	/** Ids and the day only — never the code or the link that embeds it (invariant #7). */
	private void abandon(MissingBookingFact fact, BookingDayRefunded event) {
		meters.counter(ObservabilityMetrics.MAIL_DAY_REFUND_ABANDONED, MissingBookingFact.TAG, fact.tagValue())
				.increment();
		log.error("Day-refund mail abandoned ({}) for booking {} on {} — the fact cannot appear later, so the "
				+ "publication completes and nothing retries it: the guest's booking page still lists the day",
				fact.tagValue(), event.bookingId().value(), event.serviceDate());
	}
}
