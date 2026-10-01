package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.StayMoveDue;
import ai.riviera.platform.booking.vocabulary.StayMoveFacts;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.MoveReminderMailFacts;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.monitoring.vocabulary.ObservabilityMetrics;

/**
 * Mails the evening-before move reminder on {@link StayMoveDue}: tomorrow's spot, how far from today's,
 * under the stay's code with the code-gated link. The event carries ids and the day only (invariant #7);
 * the code, both sets and the distance resolve via {@code booking}'s move-reminder facts, the labels and
 * the contact via {@link BookingMailFactsService}. On {@code BookingMovedMailListener}'s terms: after
 * commit, on the mail executor, no {@code @Transactional}, at-least-once, a missing fact abandoned under
 * {@link ObservabilityMetrics#MAIL_MOVE_REMINDER_ABANDONED}, a transport failure propagated.
 */
@Component
class StayMoveReminderMailListener {

	private static final Logger log = LoggerFactory.getLogger(StayMoveReminderMailListener.class);

	private final BookingNotificationFacts bookings;
	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final BookingLinks links;
	private final MeterRegistry meters;

	StayMoveReminderMailListener(BookingNotificationFacts bookings, BookingMailFactsService facts,
			TransactionalMailService mails, BookingLinks links, MeterRegistry meters) {
		this.bookings = bookings;
		this.facts = facts;
		this.mails = mails;
		this.links = links;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener(id = "notification.mail-on-stay-move-due")
	void on(StayMoveDue event) {
		bookings.moveReminderFacts(event.bookingId()).ifPresentOrElse(move -> send(event, move),
				() -> abandon(MissingBookingFact.NO_BOOKING, event));
	}

	private void send(StayMoveDue event, StayMoveFacts move) {
		switch (facts.resolveMoveReminder(move, links.forBooking(move.code()))) {
			case MoveReminderMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case MoveReminderMailFacts.Resolved resolved -> mails.sendMoveReminder(resolved.toEmail(), resolved.mail());
		}
	}

	/** Ids and the day only — never the code or the link that embeds it (invariant #7). */
	private void abandon(MissingBookingFact fact, StayMoveDue event) {
		meters.counter(ObservabilityMetrics.MAIL_MOVE_REMINDER_ABANDONED, MissingBookingFact.TAG, fact.tagValue())
				.increment();
		log.error("Move-reminder mail abandoned ({}) for stay {} stretch {} moving on {} — the fact cannot appear "
				+ "later, so the publication completes and nothing retries it: the guest learns the spot at the "
				+ "morning scan", fact.tagValue(), event.stayId().value(), event.bookingId().value(), event.moveDate());
	}
}
