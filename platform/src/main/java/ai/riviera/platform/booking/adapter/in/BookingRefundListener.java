package ai.riviera.platform.booking.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.vocabulary.RefundResult;

/**
 * Issues the cancellation refund <strong>after</strong> the cancel transaction commits (U6) — a
 * booking-module driving adapter reacting to its own module's {@link BookingCancelled} fact. This
 * keeps the money-moving Stripe call out of the cancel transaction (no row lock held across a network
 * round-trip, no money/state divergence on a post-refund commit failure) while still driving the
 * refund through {@code payment::api} ({@code booking → payment}, no cycle — invariant #11).
 *
 * <p><strong>Asynchronous and registry-backed, at-least-once:</strong> the refund is server-initiated
 * with an idempotency key (invariant #8/#10), so a redelivery never double-refunds. On a gateway
 * {@link RefundResult.Failed} it <strong>throws</strong> so the Event Publication Registry retains the
 * publication and re-submits it (loud over silent for money — the same posture as the payout accrual;
 * the idempotency key makes the retry safe). No refund is issued when nothing is owed.
 *
 * <p><strong>Why the annotations are spelled out rather than composed (#404).</strong>
 * {@code @ApplicationModuleListener} is the obvious way to write this, and it expands to exactly
 * {@code @Async} + {@code @Transactional(REQUIRES_NEW)} + {@code @TransactionalEventListener}. Both of
 * the first two were wrong here, for the same underlying reason — this listener makes a blocking
 * gateway round-trip, up to 25s against a degraded gateway:
 *
 * <ul>
 *   <li>The bare {@code @Async} is Boot's shared {@code applicationTaskExecutor}, the eight-thread pool
 *       behind an unbounded queue that also carries {@link PaymentEventListener} (payment → confirm,
 *       invariant #8) and {@code payout}'s accrual/reversal listeners (invariant #9). Naming
 *       {@link RefundExecutorConfig#REFUND_EXECUTOR} moves the round-trip behind a bulkhead. It is not a
 *       per-cancellation trickle that makes this matter: {@code WeatherRefundService} cancels an entire
 *       venue-day in one transaction (invariant #10's admin weather exception), so one admin action
 *       dispatches that many refunds at once.</li>
 *   <li>The transaction is <strong>dropped</strong>, not merely re-scoped. It bought nothing this method
 *       needs — the only write, {@code markRefunded}, is a single statement that runs after a successful
 *       refund, so there is nothing a rollback could undo — while pinning one of ten pooled connections
 *       for the length of the round-trip, on a pool shared with every HTTP request thread. Isolating the
 *       threads without releasing the connection would have left the spine starving on the scarcer
 *       resource.</li>
 * </ul>
 *
 * <p>The class, method name and parameter type are deliberately unchanged, so the registry's
 * {@code listener_id} is byte-identical and no Flyway rewrite is owed (invariant #12).
 * {@code RefundBulkheadIT} pins all four properties — the money path unblocked, no transaction, no
 * bound connection, and the unchanged id — against a real registry.
 */
@Component
class BookingRefundListener {

	private static final Logger log = LoggerFactory.getLogger(BookingRefundListener.class);

	private final RefundPort refundPort;

	BookingRefundListener(RefundPort refundPort) {
		this.refundPort = refundPort;
	}

	@Async(RefundExecutorConfig.REFUND_EXECUTOR)
	@TransactionalEventListener
	void on(BookingCancelled event) {
		if (event.refundMinor() <= 0) {
			return; // non-refundable cancellation — nothing to refund (ADR-0005)
		}
		long bookingId = event.bookingId().value();
		RefundResult result = refundPort.refund(new BookingRef(bookingId),
				new Money(event.refundMinor(), event.currency()));
		if (result instanceof RefundResult.Failed failed) {
			throw new IllegalStateException(
					"refund failed for booking " + bookingId + ": " + failed.reason());
		}
		log.info("refunded cancelled booking {} ({} {})", bookingId, event.refundMinor(),
				event.currency());
	}
}
