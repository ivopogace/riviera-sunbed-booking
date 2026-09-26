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
 * Issues the cancellation refund via {@link RefundPort} after the cancel transaction commits
 * (invariants #10, #11); nothing is refunded when nothing is owed. Throws on {@link RefundResult.Failed}
 * so the registry retains and re-drives the publication; a redelivery never double-refunds (§payment).
 * Runs on the refund bulkhead and deliberately outside any transaction — load-bearing, see
 * {@code RESPONSIBILITIES.md} §booking. Renaming the class, {@code on} or its parameter type changes
 * the registry {@code listener_id} and orphans outstanding publications.
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
