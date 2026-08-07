package ai.riviera.platform.notification.adapter.in;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.ConfirmationAttemptRecorder;
import ai.riviera.platform.notification.application.ConfirmationSendOutcome;
import ai.riviera.platform.notification.application.MailAttemptOutcome;
import ai.riviera.platform.notification.application.MailAttemptSource;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Mails the tourist their booking code when a booking is confirmed — the {@code notification} module's
 * driving adapter for the registry vehicle. {@link BookingMailFactsService} does the {@code booking} /
 * {@code venue} / {@code customer} assembly, so this class keeps only what is confirmation-specific:
 * the message it builds and the loss it counts. Nothing the event already carries is re-derived.
 * Delivery goes through {@link TransactionalMailService} — the chokepoint — never the transport.
 *
 * <p><strong>Asynchronous and after-commit</strong>, so a mail failure can never roll back a booking.
 * The two annotations are {@code @ApplicationModuleListener}'s own expansion written out, and must
 * stay that way: the composite takes no executor qualifier, so its bare {@code @Async} would mean
 * Boot's shared {@code applicationTaskExecutor} — the pool carrying payment→booking (invariant #8) and
 * booking→payout (invariant #9), which under the {@code mailer} profile would put a blocking SMTP
 * round-trip on the money path once per confirmed booking. {@link RegistryMailExecutorConfig} argues
 * the dedicated pool; {@code RegistryMailBulkheadIT} proves the spine stays responsive while this
 * transport hangs.
 *
 * <p><strong>{@code @Transactional(REQUIRES_NEW)} is deliberately absent — do not restore it.</strong>
 * The port reads are independent read-only queries delivered after the producer committed, so there is
 * nothing to keep consistent between them, while a transaction would pin a Hikari connection for the
 * whole method, SMTP round-trip included.
 * {@code RegistryMailBulkheadIT#sendsWithNoTransactionHeldOpen} asserts the connection is unbound
 * rather than merely the transaction inactive — {@code NOT_SUPPORTED} would satisfy the weaker check
 * while still pinning it. Registry tracking keys on {@code @TransactionalEventListener}, not on the
 * transaction.
 *
 * <p><strong>The class name, method name and parameter type are part of the contract.</strong> The
 * registry's {@code listener_id} embeds exactly those and republication matches it string-equal, so
 * renaming any of them orphans every outstanding publication. Pinned by
 * {@code RegistryMailBulkheadIT#keepsTheListenerIdV31Migrated}.
 *
 * <p>The Event Publication Registry is the <em>whole</em> idempotency story: it completes a publication
 * only after this method returns, and restart-republish resubmits only those with a NULL
 * {@code completion_date}. There is deliberately no dedupe table — one written inside this transaction
 * would share the identical crash window (send succeeds, process dies, row rolls back). The accepted
 * guarantee is <strong>at-least-once</strong>; the lever for the opposite failure ("completed, but the
 * inbox is empty") is the ADMIN resend, not a restart.
 *
 * <p>A missing booking, set or contact is logged and skipped rather than thrown: none can appear later,
 * so retrying would only park a permanently-failing publication in the outbox. A transport failure
 * propagates on purpose. Nothing here logs the arrival code (invariant #7). Why
 * {@link ObservabilityMetrics#MAIL_CONFIRMATION_ABANDONED} escalates per loss with no episode throttle,
 * unlike its siblings: {@code RESPONSIBILITIES.md} §{@code notification} and
 * {@code docs/runbooks/observability.md}.
 */
@Component
class BookingConfirmationMailListener {

	private static final Logger log = LoggerFactory.getLogger(BookingConfirmationMailListener.class);

	private final BookingMailFactsService facts;
	private final TransactionalMailService mails;
	private final ConfirmationAttemptRecorder attempts;
	private final MeterRegistry meters;

	BookingConfirmationMailListener(BookingMailFactsService facts, TransactionalMailService mails,
			ConfirmationAttemptRecorder attempts, MeterRegistry meters) {
		this.facts = facts;
		this.mails = mails;
		this.attempts = attempts;
		this.meters = meters;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingConfirmed event) {
		switch (facts.resolve(event.bookingId(), event.setId())) {
			case BookingMailFacts.Missing(MissingBookingFact fact) -> abandon(fact, event);
			case BookingMailFacts.Resolved booking -> send(booking, event);
		}
	}

	/**
	 * Send, then record what became of it (#380) — the delivery history a support agent reads.
	 *
	 * <p>The transport failure is recorded and <strong>rethrown</strong>: the throw is load-bearing (it
	 * keeps the publication outstanding for the at-least-once retry), and the row survives it because
	 * the attempt log runs outside any transaction — this listener deliberately holds none, so the
	 * insert has already committed by the time the exception leaves. Recording before the rethrow, not
	 * after, is the only ordering that gets both.
	 */
	private void send(BookingMailFacts.Resolved booking, BookingConfirmed event) {
		ConfirmationSendOutcome outcome;
		try {
			outcome = mails.sendBookingConfirmation(booking.toEmail(),
					new BookingConfirmationMail(booking.bookingCode(), booking.venueName(),
							event.bookingDate(), booking.rowLabel(), booking.positionNo(),
							event.amountMinor(), event.currency()));
		}
		catch (RuntimeException e) {
			attempts.recordAttempt(event.bookingId(), MailAttemptSource.AUTOMATIC,
					MailAttemptOutcome.TRANSPORT_FAILED);
			throw e;
		}
		attempts.recordAttempt(event.bookingId(), MailAttemptSource.AUTOMATIC, outcome.recorded());
	}

	/**
	 * Account for a confirmation mail this listener will never send. Both halves matter: the counter is
	 * what an alert can watch — this method returns <em>normally</em>, so the registry completes the
	 * publication and {@code riviera.outbox.pending} never moves — and the line is the only per-loss
	 * record. It carries the booking and set ids because they say <em>which</em> booking lost its mail,
	 * which the correlation id riding the MDC does not: the two answer different questions. Ids and the
	 * reason only — never the arrival code (invariant #7), never the address.
	 */
	private void abandon(MissingBookingFact fact, BookingConfirmed event) {
		attempts.recordAttempt(event.bookingId(), MailAttemptSource.AUTOMATIC,
				MailAttemptOutcome.ABANDONED_MISSING_FACTS);
		meters.counter(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Booking-confirmation mail abandoned ({}) for booking {} on set {} — the fact cannot "
				+ "appear later, so the publication completes and nothing retries it: a paying tourist "
				+ "has no arrival code by mail", fact.tagValue(), event.bookingId().value(),
				event.setId().value());
	}
}
