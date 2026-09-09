package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.BookingMoved;
import ai.riviera.platform.booking.vocabulary.BookingMoveFacts;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the tourist that a remodel moved their booking: both spots, the distance, the free-exit
 * deadline and the link where that cancel lives. The event carries ids only (invariant #7); the
 * contact, code and venue resolve through {@link BookingMailFactsService} on the set the booking now
 * holds, and the spots, distance and deadline through {@code booking}'s move facts — the receipt's
 * snapshot, since the old set may already be retired or renumbered. Asynchronous and after-commit on
 * the mail bulkhead, like every listener here ({@code MailListenerExecutorArchitectureTest}); the
 * move, the layout and the receipt committed before this runs, so no mail outcome can touch them.
 * Giving up is counted under {@link ObservabilityMetrics#MAIL_MOVE_ABANDONED}.
 */
@Component
class BookingMovedMailListener {

	private static final Logger log = LoggerFactory.getLogger(BookingMovedMailListener.class);

	private final BookingMailFactsService facts;
	private final BookingNotificationFacts bookings;
	private final TransactionalMailService mails;
	private final BookingLinks links;
	private final MeterRegistry meters;

	BookingMovedMailListener(BookingMailFactsService facts, BookingNotificationFacts bookings,
			TransactionalMailService mails, BookingLinks links, MeterRegistry meters) {
		this.facts = facts;
		this.bookings = bookings;
		this.mails = mails;
		this.links = links;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingMoved event) {
		switch (facts.resolve(event.bookingId(), event.toSetId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> bookings.moveFacts(event.bookingId()).ifPresentOrElse(
					move -> mails.sendBookingMoved(booking.toEmail(), mailOf(booking, move)),
					() -> abandon(MissingBookingFact.NO_BOOKING, event));
		}
	}

	private BookingMovedMail mailOf(BookingMailFacts.Resolved booking, BookingMoveFacts move) {
		return new BookingMovedMail(booking.bookingCode(), booking.venueName(), move.bookingDate(),
				move.fromRowLabel(), move.fromPositionNo(), move.toRowLabel(), move.toPositionNo(), move.rowsAway(),
				move.positionsAway(), move.freeExitUntil(), links.forBooking(booking.bookingCode()));
	}

	/** Ids and the reason only — never the code or the booking link that embeds it (invariant #7). */
	private void abandon(MissingBookingFact fact, BookingMoved event) {
		meters.counter(ObservabilityMetrics.MAIL_MOVE_ABANDONED, MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Booking-moved mail abandoned ({}) for booking {} from set {} to set {} — the fact cannot "
				+ "appear later, so the publication completes and nothing retries it: the guest has no notice "
				+ "of the new spot or of the free-exit deadline", fact.tagValue(), event.bookingId().value(),
				event.fromSetId().value(), event.toSetId().value());
	}
}
