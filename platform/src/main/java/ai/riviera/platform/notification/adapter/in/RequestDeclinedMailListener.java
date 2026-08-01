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
 * Mails the tourist a record that the venue declined their Request-to-Book (#124) — the outcome
 * that until now reached only a guest who happened to reload the code-gated view, leaving everyone
 * else waiting on a request already refused.
 *
 * <p><strong>Whether the mail is warranted was decided upstream</strong>, exactly as for the
 * payment-due kind: {@code booking} publishes {@code BookingRequestDeclined} only from the winning
 * decline leg, in the same transaction as the guarded transition, so a lost race or a withdraw
 * never reaches this class and no status re-read could do anything here but race the row.
 *
 * <p>Everything the mail renders is on the payload or resolved through
 * {@link BookingMailFactsService}, the shared three-port assembly; the arrival code comes through
 * {@code booking::api} and the status link is built from it at send time by {@link BookingLinks} —
 * never from the payload, which the registry persists as text (invariant #7). The copy is a plain
 * record by product decision: declined, nothing held, nothing charged, the link.
 *
 * <p><strong>Asynchronous and after-commit on the mail bulkhead</strong> — the shape
 * {@code MailListenerExecutorArchitectureTest} requires of every listener here. Idempotency is the
 * Event Publication Registry's, whole; a transport failure propagates on purpose so the send is
 * retried. Giving up on an unresolvable fact is counted under this flow's own name,
 * {@link ObservabilityMetrics#MAIL_REQUEST_DECLINED_ABANDONED} — per loss, {@code ERROR}, never
 * summed with its four siblings — and returns normally so the publication completes: none of the
 * three facts can appear later.
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
