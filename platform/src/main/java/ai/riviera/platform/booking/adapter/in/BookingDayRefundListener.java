package ai.riviera.platform.booking.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.RefundResult;

/**
 * Issues a refunded day's money via {@link RefundPort#refundDay} after a day refund commits
 * (invariants #10, #11); nothing is refunded for a zero-rate day. Throws on {@link RefundResult.Failed} so
 * the registry retains and re-drives the publication; a redelivery never refunds a day twice (§payment).
 * Runs on the refund bulkhead, outside any transaction, as {@code BookingRefundListener} does. Its
 * registry id is pinned by {@code ListenerIdSnapshotTest}; changing it owes a Flyway rewrite.
 */
@Component
class BookingDayRefundListener {

	private static final Logger log = LoggerFactory.getLogger(BookingDayRefundListener.class);

	private final RefundPort refundPort;

	BookingDayRefundListener(RefundPort refundPort) {
		this.refundPort = refundPort;
	}

	@Async(RefundExecutorConfig.REFUND_EXECUTOR)
	@TransactionalEventListener(id = "booking.day-refund-on-booking-day-refunded")
	void on(BookingDayRefunded event) {
		if (event.refundMinor() <= 0) {
			return;
		}
		long bookingId = event.bookingId().value();
		RefundResult result = refundPort.refundDay(new BookingRef(bookingId), event.serviceDate(),
				new Money(event.refundMinor(), event.currency()));
		if (result instanceof RefundResult.Failed failed) {
			throw new IllegalStateException("day refund failed for booking " + bookingId + " on "
					+ event.serviceDate() + ": " + failed.reason());
		}
		log.info("refunded day {} of booking {} ({} {})", event.serviceDate(), bookingId, event.refundMinor(),
				event.currency());
	}
}
