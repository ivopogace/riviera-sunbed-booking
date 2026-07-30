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
 * Mails the tourist their booking code when a booking is confirmed (#371, epic #367 story 1) — the
 * design spec's promised "booking code plus an email", which until #371 lived only in a browser tab.
 *
 * <p>The {@code notification} module's driving adapter for the registry vehicle (#382; until then
 * this listener sat at the platform edge — the move is why the module's {@code allowedDependencies}
 * read like a fan-in). The three-port assembly it used to perform inline moved inside the hexagon in
 * #374, when the cancellation listener needed it verbatim: {@link BookingMailFactsService} now reads
 * {@code booking}, {@code venue} and {@code customer}, and this class keeps only what is
 * confirmation-specific — the message it builds and the loss it counts. Nothing is re-derived that
 * the event already carries: the date, amount and currency are immutable facts of the confirmation
 * and ride the payload. Delivery goes through {@link TransactionalMailService} — the chokepoint —
 * never the transport directly.
 *
 * <p><strong>Asynchronous and after-commit</strong>, so a mail failure can never roll back a booking.
 * This was an {@code @ApplicationModuleListener} until #383; it is now that annotation's own expansion
 * — {@code @Async} + {@code @TransactionalEventListener}, whose default phase is
 * {@code AFTER_COMMIT} — written out, because the composite takes no executor qualifier and its bare
 * {@code @Async} means Boot's shared {@code applicationTaskExecutor}: the pool that also carries the
 * payment→booking confirmation (invariant #8) and the booking→payout accrual (invariant #9). Under the
 * {@code mailer} profile that put a blocking SMTP round-trip on the money path once per confirmed
 * booking. {@link RegistryMailExecutorConfig} argues the dedicated pool; {@code RegistryMailBulkheadIT}
 * proves the spine stays responsive while this transport hangs.
 *
 * <p><strong>The third annotation, {@code @Transactional(REQUIRES_NEW)}, is deliberately not restored.</strong>
 * The three port reads below are independent read-only queries with nothing to keep consistent between
 * them — the event is delivered after the producer committed, so each already sees settled state. What
 * a transaction did add was a Hikari connection held for the whole method, SMTP round-trip included.
 * That is a second, independent hazard, not the one that reproduced: the pre-fix
 * {@code RegistryMailBulkheadIT} failed by <strong>starving the shared pool of threads</strong> — the
 * invariant-#8 confirmation timed out behind ten wedged sends — never by exhausting the connection
 * pool, which stock sizing puts out of reach anyway (8 core executor threads against 10 connections).
 * Dropping the transaction is worth doing on its own terms, and
 * {@code RegistryMailBulkheadIT#sendsWithNoTransactionHeldOpen} asserts the connection is unbound and
 * not merely the transaction inactive — {@code NOT_SUPPORTED} would satisfy the weaker check while
 * still pinning the connection. Registry tracking is unaffected either way — it keys on
 * {@code @TransactionalEventListener}, not on the transaction — and that too is asserted, not assumed.
 *
 * <p>The class, method name and parameter type are all unchanged, so the registry's {@code listener_id}
 * (which embeds exactly those, and which republication matches string-equal) still reads as V31 (#382)
 * migrated it — no Flyway rewrite, pinned by {@code RegistryMailBulkheadIT#keepsTheListenerIdV31Migrated}.
 *
 * <p>The Event Publication Registry is the <em>whole</em> idempotency story:
 * it marks a publication complete only after this method returns, and
 * {@code republish-outstanding-events-on-restart} resubmits only publications with a NULL
 * {@code completion_date}. There is deliberately no dedupe table — one written inside this
 * transaction would share the identical crash window (send succeeds, process dies, row rolls back),
 * so it would buy nothing. The accepted guarantee is therefore <strong>at-least-once</strong>; the
 * operational lever for the opposite failure ("completed, but the inbox is empty") is the admin
 * resend in #380, not a restart.
 *
 * <p>A missing booking, set or contact is logged and skipped rather than thrown: none of them can
 * appear later, so retrying would only park a permanently-failing publication in the outbox. A
 * transport failure, by contrast, propagates on purpose — that publication stays outstanding and is
 * retried. Nothing here logs the arrival code (invariant #7).
 *
 * <p><strong>Giving up is counted, and the line is an {@code ERROR} (#428).</strong> Skipping is
 * right; skipping silently was not. Because this method returns <em>normally</em>, the registry
 * completes the publication and {@code riviera.outbox.pending} never moves — so
 * {@link ObservabilityMetrics#MAIL_CONFIRMATION_ABANDONED} is the only trace a lost confirmation
 * leaves anywhere, which is why it is emitted here rather than left to the send chokepoint that
 * never sees this mail.
 *
 * <p><strong>Why {@code ERROR}, one line per loss, with no episode throttle.</strong> Each of the
 * three facts is FK-protected and never hard-deleted — {@code booking.set_id} and
 * {@code booking.customer_id} are plain foreign keys with no {@code ON DELETE CASCADE}, no code
 * deletes a booking, and erasure tombstones the guest row in place — so <em>none</em> of these
 * returns is reachable through any application path. An increment is therefore two things at once: a
 * referential-integrity defect, and a tourist who paid and will never receive their arrival code
 * with nothing to retry from. The two arguments that hold the sibling counters down do not reach
 * here: the registry pool's shed throttles because saturation is transient and self-recovering,
 * while {@code TransactionalMailService} stays at {@code WARN} because a relay outage fails every
 * send at once and would flood. This is zero in a healthy system, so it cannot flood — and with no
 * durable copy of the mail, the line is the only per-loss artefact there is (the #415 rule).
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
			attempts.record(event.bookingId(), MailAttemptSource.AUTOMATIC,
					MailAttemptOutcome.TRANSPORT_FAILED);
			throw e;
		}
		attempts.record(event.bookingId(), MailAttemptSource.AUTOMATIC, outcome.recorded());
	}

	/**
	 * Account for a confirmation mail this listener will never send. Both halves matter: the counter
	 * is what an alert can watch (nothing else moves — see the class Javadoc), and the line is the
	 * only per-loss record. It carries the booking and set ids for exactly that reason: they say
	 * <em>which</em> booking lost its mail, which is what an operator can then query. Since #410 the
	 * pool also propagates the confirming request's MDC, so the line carries a correlation id too — the
	 * two answer different questions (which request, which booking) and the ids are not made redundant
	 * by it. Ids and the reason only — never the arrival code (invariant #7), never the address.
	 */
	private void abandon(MissingBookingFact fact, BookingConfirmed event) {
		attempts.record(event.bookingId(), MailAttemptSource.AUTOMATIC,
				MailAttemptOutcome.ABANDONED_MISSING_FACTS);
		meters.counter(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED,
				MissingBookingFact.TAG, fact.tagValue()).increment();
		log.error("Booking-confirmation mail abandoned ({}) for booking {} on set {} — the fact cannot "
				+ "appear later, so the publication completes and nothing retries it: a paying tourist "
				+ "has no arrival code by mail", fact.tagValue(), event.bookingId().value(),
				event.setId().value());
	}
}
