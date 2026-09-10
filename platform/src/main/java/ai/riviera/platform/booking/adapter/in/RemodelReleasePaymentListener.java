package ai.riviera.platform.booking.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payment.api.CancelPaymentPort;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;

/**
 * Voids the PaymentIntent of a booking a remodel released, <strong>after</strong> the commit
 * transaction. An unpaid claim on a set the venue removed is cancelled without money changing hands,
 * but its intent is still collectable — the abandoned-payment sweep only ever reads
 * {@code AWAITING_PAYMENT} rows, so nothing else would reach it again and the guest could still pay
 * for a booking that no longer exists. Cancelling voids an uncollected intent and moves no money
 * (collect-only, ADR-0002 / invariant #8).
 *
 * <p><strong>Which cancellations it acts on.</strong> A {@link RefundReason#VENUE_CHANGE} that
 * returns nothing is exactly a remodel-released unpaid claim: the venue-caused refund and the moved
 * guest's free exit both return the whole amount, and every other reason belongs to a booking that
 * collected. Acting on the rest would put a gateway round-trip on the guest cancel path for an
 * answer that can only be {@code NotCancellable}.
 *
 * <p><strong>The shape is the bulkhead's</strong>, required of every {@code booking} listener that
 * reaches {@code payment.api} ({@code RefundListenerExecutorArchitectureTest}) and argued on
 * {@link BookingRefundListener}: the named executor keeps a degraded gateway off the money-path
 * spine, and {@code @TransactionalEventListener} leaves an {@code event_publication} row so a
 * transient failure is retried. That is why {@link PaymentCancellation.Failed} throws.
 * {@link PaymentCancellation.NotCancellable} means the guest paid between the commit and this call:
 * nothing here can undo that, so it is logged for a manual refund rather than retried forever.
 */
@Component
class RemodelReleasePaymentListener {

	private static final Logger log = LoggerFactory.getLogger(RemodelReleasePaymentListener.class);

	private final CancelPaymentPort cancelPaymentPort;

	RemodelReleasePaymentListener(CancelPaymentPort cancelPaymentPort) {
		this.cancelPaymentPort = cancelPaymentPort;
	}

	@Async(RefundExecutorConfig.REFUND_EXECUTOR)
	@TransactionalEventListener
	void on(BookingCancelled event) {
		if (event.reason() != RefundReason.VENUE_CHANGE || event.refundMinor() > 0) {
			return;
		}
		long bookingId = event.bookingId().value();
		switch (cancelPaymentPort.cancel(new BookingRef(bookingId))) {
			case PaymentCancellation.Canceled ignored ->
				log.info("voided the intent of booking {} released by a remodel", bookingId);
			case PaymentCancellation.NoCollection ignored ->
				log.debug("booking {} released by a remodel had no payment on record", bookingId);
			case PaymentCancellation.NotCancellable notCancellable -> log.error(
					"booking {} was released by a remodel but its payment already succeeded ({}) — the guest has "
							+ "paid for a cancelled booking and is owed a refund by hand",
					bookingId, notCancellable.reason());
			case PaymentCancellation.Failed failed -> throw new IllegalStateException(
					"could not void the intent of released booking " + bookingId + ": " + failed.reason());
		}
	}
}
