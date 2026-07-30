package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the tourist a record of a cancelled booking and the refund that goes with it (#374, epic
 * #367 story 15) — the thing a tourist has, today, only as a screen that closed.
 *
 * <p><strong>One listener covers every cancellation channel, and that is the design rather than a
 * convenience.</strong> Two paths cancel a booking — the tourist's own self-service cancel
 * ({@code CancelBookingService}, {@code RefundReason.POLICY}) and the operator-triggered weather
 * refund ({@code WeatherRefundService}, {@code WEATHER}, which cancels a venue's whole date) — and
 * both publish this one event. Subscribing to the fact rather than to either caller means a third
 * channel is covered the day it lands, with nothing to remember.
 *
 * <p>Everything the mail renders is either on the payload or resolved through
 * {@link BookingMailFactsService}. The refund is emphatically the former: {@code refundMinor} and
 * {@code currency} are the <strong>server-computed</strong> decision this event carries (invariant
 * #10 — {@code CancellationPolicy.quote}'s tiered answer for a policy cancel, the gross amount for
 * weather), in integer minor units (invariant #5). Recomputing it here would put a second opinion
 * about money in a module that owns none. <strong>Zero is a decision too</strong> — a cancellation
 * after the invariant-#4 cutoff refunds nothing, and the mail says so in words.
 *
 * <p><strong>It reports a decision, not a settlement.</strong> This event fires when the booking is
 * cancelled; the money is returned afterwards by {@code booking}'s own {@code BookingCancelled}
 * listener via {@code payment}'s {@code RefundPort}, which can fail
 * ({@link ObservabilityMetrics#REFUNDS_FAILED}). The copy is written to that limit. Closing the gap
 * would need a refund-settled fact no module publishes today.
 *
 * <p><strong>Asynchronous and after-commit</strong>, on the mail bulkhead — the shape
 * {@code MailListenerExecutorArchitectureTest} requires of every listener here, and whose reasoning
 * (why not {@code @ApplicationModuleListener}, why not a bare {@code @EventListener}, why no
 * {@code @Transactional}) is argued once on {@link BookingConfirmationMailListener} and applies
 * unchanged. The cancellation transaction has already committed by the time this runs, so no mail
 * outcome can touch the cancellation, the availability release (invariant #2), or the refund.
 *
 * <p>Idempotency is the Event Publication Registry's, whole: it completes the publication only on a
 * normal return, and only NULL-{@code completion_date} rows are resubmitted. No dedupe table, the
 * same accepted at-least-once contract as the confirmation. A transport failure propagates on
 * purpose so the publication stays outstanding and is retried.
 *
 * <p><strong>Giving up is counted under this flow's own name</strong> —
 * {@link ObservabilityMetrics#MAIL_CANCELLATION_ABANDONED}, not the confirmation's. The two losses
 * ride the same vehicle and share the same three reasons, but they are not the same event and must
 * not be summed: one leaves a paying tourist without an arrival code, this one leaves a cancelled
 * tourist without a record of money owed back. Like its sibling it is the only trace such a loss
 * leaves anywhere — the method returns normally, so the registry completes the publication and
 * {@code riviera.outbox.pending} never moves.
 */
@Component
class BookingCancellationMailListener {

	private static final Logger log = LoggerFactory.getLogger(BookingCancellationMailListener.class);

	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final MeterRegistry meters;

	BookingCancellationMailListener(BookingMailFactsService facts, TransactionalMailService mails,
			MeterRegistry meters) {
		this.facts = facts;
		this.mails = mails;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingCancelled event) {
		switch (facts.resolve(event.bookingId(), event.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> mails.sendBookingCancellation(booking.toEmail(),
					new BookingCancellationMail(booking.bookingCode(), booking.venueName(),
							event.bookingDate(), event.refundMinor(), event.currency(), event.reason()));
		}
	}

	/**
	 * Account for a cancellation mail this listener will never send. The counter is what an alert can
	 * watch — nothing else moves — and the line is the only per-loss record, which is why it carries
	 * the booking and set ids: they say <em>which</em> booking lost its mail, and therefore which
	 * refund an operator should confirm actually moved. Ids and the reason only — never the arrival
	 * code (invariant #7), never the address. The correlation id of the cancelling request rides the
	 * MDC (#410).
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
