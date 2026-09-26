package ai.riviera.platform.notification.adapter.in;

import java.net.URI;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.RebookLinks;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the tourist a record of a cancelled booking and its refund — one listener for every
 * cancellation channel. Renders the server-computed refund off the payload (invariants #10, #5); zero
 * is a decision too. It reports the decision, not a settlement: the refund may still fail
 * ({@link ObservabilityMetrics#REFUNDS_FAILED}). Only a remodel-ended booking gets a {@link RebookLinks}
 * link, and {@code VENUE_CHANGE} alone cannot say so. Async after-commit on the mail bulkhead, no
 * {@code @Transactional}, at-least-once. Rationale: RESPONSIBILITIES.md §notification, ADR-0011.
 */
@Component
class BookingCancellationMailListener {

	private static final Logger log = LoggerFactory.getLogger(BookingCancellationMailListener.class);

	private final BookingMailFactsService facts;
	private final BookingNotificationFacts bookings;
	private final TransactionalMailService mails;
	private final RebookLinks rebookLinks;
	private final MeterRegistry meters;

	BookingCancellationMailListener(BookingMailFactsService facts, BookingNotificationFacts bookings,
			TransactionalMailService mails, RebookLinks rebookLinks, MeterRegistry meters) {
		this.facts = facts;
		this.bookings = bookings;
		this.mails = mails;
		this.rebookLinks = rebookLinks;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingCancelled event) {
		switch (facts.resolve(event.bookingId(), event.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> mails.sendBookingCancellation(booking.toEmail(),
					new BookingCancellationMail(booking.bookingCode(), booking.venueName(),
							event.bookingDate(), event.lastDay(), event.refundMinor(), event.currency(), event.reason(),
							rebookLinkFor(event)));
		}
	}

	private URI rebookLinkFor(BookingCancelled event) {
		return event.reason() == RefundReason.VENUE_CHANGE && bookings.endedByRemodel(event.bookingId())
				? rebookLinks.forDate(event.venueId(), event.bookingDate())
				: null;
	}

	/**
	 * Counts and logs a mail that will never be sent — the only trace, as the publication completes. Log
	 * ids and the reason only; never the code (invariant #7) or the address.
	 */
	private void abandon(MissingBookingFact fact, BookingCancelled event) {
		meters.counter(ObservabilityMetrics.MAIL_CANCELLATION_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Booking-cancellation mail abandoned ({}) for booking {} on set {} — the fact cannot "
				+ "appear later, so the publication completes and nothing retries it: the tourist has no "
				+ "record of the cancellation or its refund", fact.tagValue(), event.bookingId().value(),
				event.setId().value());
	}
}
