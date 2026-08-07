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
 * Mails the tourist a record of a cancelled booking and the refund that goes with it.
 *
 * <p><strong>One listener covers every cancellation channel, and that is the design rather than a
 * convenience.</strong> Both paths that cancel a booking — the tourist's self-service cancel
 * ({@code RefundReason.POLICY}) and the operator-triggered weather refund ({@code WEATHER}, which
 * cancels a venue's whole date) — publish this one event. Subscribing to the fact rather than to
 * either caller means a third channel is covered the day it lands, with nothing to remember.
 *
 * <p>The refund rides the payload, not a recomputation: {@code refundMinor} and {@code currency} are
 * the <strong>server-computed</strong> decision the event carries (invariant #10) in integer minor
 * units (invariant #5). Recomputing here would put a second opinion about money in a module that owns
 * none. <strong>Zero is a decision too</strong> — a cancellation after the invariant-#4 cutoff refunds
 * nothing, and the mail says so in words.
 *
 * <p><strong>It reports a decision, not a settlement.</strong> The event fires when the booking is
 * cancelled; the money is returned afterwards by {@code booking}'s own listener via {@code payment}'s
 * {@code RefundPort}, which can fail ({@link ObservabilityMetrics#REFUNDS_FAILED}). The copy is written
 * to that limit; closing the gap would need a refund-settled fact no module publishes today.
 *
 * <p><strong>Asynchronous and after-commit</strong>, on the mail bulkhead —
 * {@code MailListenerExecutorArchitectureTest} requires that shape of every listener here, and the
 * reasoning is argued once on {@link BookingConfirmationMailListener} and applies unchanged, as does
 * the at-least-once contract and the propagate-on-transport-failure rule. The cancellation transaction
 * has already committed by the time this runs, so no mail outcome can touch the cancellation, the
 * availability release (invariant #2), or the refund.
 *
 * <p><strong>Giving up is counted under this flow's own name</strong> —
 * {@link ObservabilityMetrics#MAIL_CANCELLATION_ABANDONED}, not the confirmation's. The two ride the
 * same vehicle and share the same three reasons but are not the same event and <strong>must not be
 * summed</strong>: one leaves a paying tourist without an arrival code, this one leaves a cancelled
 * tourist without a record of money owed back.
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
