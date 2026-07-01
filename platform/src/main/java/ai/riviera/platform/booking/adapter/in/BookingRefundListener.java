package ai.riviera.platform.booking.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

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
 * <p><strong>Asynchronous</strong> {@code @ApplicationModuleListener} (registry-backed, at-least-once):
 * the refund is server-initiated with an idempotency key (invariant #8/#10), so a redelivery never
 * double-refunds. On a gateway {@link RefundResult.Failed} it <strong>throws</strong> so the Event
 * Publication Registry retains the publication and re-submits it (loud over silent for money — the
 * same posture as the payout accrual; the idempotency key makes the retry safe). No refund is issued
 * when nothing is owed.
 */
@Component
class BookingRefundListener {

	private static final Logger log = LoggerFactory.getLogger(BookingRefundListener.class);

	private final RefundPort refundPort;

	BookingRefundListener(RefundPort refundPort) {
		this.refundPort = refundPort;
	}

	@ApplicationModuleListener
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
