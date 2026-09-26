package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingPaymentDue;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the tourist that their accepted request must be paid by {@code payBy} — useless after it,
 * when the sweep releases the set. Decides nothing: {@code booking} publishes {@link BookingPaymentDue}
 * only where money is owed (re-reading status here races the stub's synchronous confirm), and
 * {@code payBy} rides the payload; the code is resolved at send time, never carried (invariant #7).
 * Async after-commit on the mail bulkhead, no {@code @Transactional}; at-least-once, so a transport
 * failure propagates. Rationale: RESPONSIBILITIES.md §notification, ADR-0011.
 */
@Component
class RequestPaymentDueMailListener {

	private static final Logger log = LoggerFactory.getLogger(RequestPaymentDueMailListener.class);

	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final BookingLinks links;
	private final MeterRegistry meters;

	RequestPaymentDueMailListener(BookingMailFactsService facts, TransactionalMailService mails,
			BookingLinks links, MeterRegistry meters) {
		this.facts = facts;
		this.mails = mails;
		this.links = links;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingPaymentDue event) {
		switch (facts.resolve(event.bookingId(), event.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> mails.sendPaymentDue(booking.toEmail(),
					new PaymentDueMail(booking.bookingCode(), booking.venueName(), event.bookingDate(),
							event.payBy(), event.amountMinor(), event.currency(),
							links.forBooking(booking.bookingCode()),
							event.cancellationWindowAtBirth(), event.lateCancelRefundBps()));
		}
	}

	/**
	 * Counts and logs a mail that will never be sent — the only trace, as the publication completes. Log
	 * ids, the reason and {@code payBy} only; never the code (invariant #7), the pay link or the address.
	 */
	private void abandon(MissingBookingFact fact, BookingPaymentDue event) {
		meters.counter(ObservabilityMetrics.MAIL_PAYMENT_DUE_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Payment-due mail abandoned ({}) for booking {} on set {} — the fact cannot appear "
				+ "later, so the publication completes and nothing retries it: the guest has no notice "
				+ "that payment is due by {}, and the sweep releases the set then", fact.tagValue(),
				event.bookingId().value(), event.setId().value(), event.payBy());
	}
}
