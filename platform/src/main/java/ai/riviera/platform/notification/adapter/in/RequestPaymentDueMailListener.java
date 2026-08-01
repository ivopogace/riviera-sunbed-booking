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
 * Mails the tourist that their accepted request must now be paid for, and by when (#373, epic #367
 * story 14) — the thing that today reaches them only if they happen to reload the app, and whose
 * absence quietly costs them the slot.
 *
 * <p><strong>It is the only one of the booking mails that is not a record of something
 * settled.</strong> The confirmation and the cancellation report a decision already made; this one
 * asks for an action inside a window. That difference is what the copy, the counter and the retry
 * posture are all shaped by — a late confirmation is still useful, a payment-due mail delivered
 * after {@code payBy} is not.
 *
 * <p><strong>Whether the mail is warranted was decided upstream, deliberately.</strong> This
 * listener does not ask whether money is owed; {@code booking} answers that by only publishing
 * {@link BookingPaymentDue} on the accept branch where it is (the event's Javadoc enumerates the
 * three). Re-deciding it here would mean reading the booking's status after the fact, which races
 * the very transitions that make the answer differ — the default-profile stub confirms
 * <em>synchronously</em>, so a status read on this pool could land on either side of it.
 *
 * <p>Everything the mail renders is either on the payload or resolved through
 * {@link BookingMailFactsService}, the same three-port assembly its sibling listeners use. The
 * deadline is emphatically the former: {@code payBy} is the server-derived instant the abandoned
 * sweep enforces, and recomputing it here would put a second opinion about the guest's window in a
 * module that owns neither the clock nor the configuration behind it. The arrival code comes from
 * {@code booking.api} rather than the payload (invariant #7 — the registry persists payloads as
 * text), and the pay link is built from it at send time by {@link BookingLinks}.
 *
 * <p><strong>Asynchronous and after-commit</strong>, on the mail bulkhead — the shape
 * {@code MailListenerExecutorArchitectureTest} requires of every listener here, argued once on
 * {@link BookingConfirmationMailListener} and applying unchanged. The accept transaction and the
 * PaymentIntent are both long done by the time this runs, so no mail outcome can touch either.
 *
 * <p>Idempotency is the Event Publication Registry's, whole, exactly as its siblings: the
 * publication completes only on a normal return, only NULL-{@code completion_date} rows are
 * resubmitted, and a transport failure propagates on purpose so the send is retried. The retry
 * matters more here than anywhere else on this vehicle — the mail is the guest's only warning, and
 * a relay blip that cost it would cost them the booking.
 *
 * <p><strong>Giving up is counted under this flow's own name</strong> —
 * {@link ObservabilityMetrics#MAIL_PAYMENT_DUE_ABANDONED}, never summed with the other two. The
 * method returns normally, so the registry completes the publication and
 * {@code riviera.outbox.pending} never moves; the counter and its line are the only trace. Unlike
 * its siblings the loss is also <em>predictive</em> — the sweep will release the set at
 * {@code payBy}, so the errand is useful only before then.
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
							links.forBooking(booking.bookingCode())));
		}
	}

	/**
	 * Account for a payment-due mail this listener will never send. The counter is what an alert can
	 * watch — nothing else moves — and the line is the only per-loss record, which is why it carries
	 * the booking id and the deadline: together they say <em>which</em> booking lost its warning and
	 * how long there is to reach the guest another way before the sweep releases the set. Ids, the
	 * deadline and the reason only — never the arrival code (invariant #7), never the pay link that
	 * embeds it, never the address. The correlation id of the accepting request rides the MDC (#410).
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
