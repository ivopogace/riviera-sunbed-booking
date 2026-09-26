package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payment.api.CancelPaymentPort;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.shared.ObservabilityMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Voids the PaymentIntent of a booking a remodel released, after commit, moving no money (ADR-0002):
 * the abandoned-payment sweep reads only {@code AWAITING_PAYMENT}, so nothing else would reach it
 * and the guest could still pay. Acts only on {@link RefundReason#VENUE_CHANGE} returning nothing,
 * the release's shape. Bulkhead ({@code RefundListenerExecutorArchitectureTest}): {@code Failed}
 * throws to be retried; {@code NotCancellable} (the guest paid first) is counted and logged for a
 * manual refund, never retried. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Component
class RemodelReleasePaymentListener {

	private static final Logger log = LoggerFactory.getLogger(RemodelReleasePaymentListener.class);

	private final CancelPaymentPort cancelPaymentPort;

	private final Counter collected;

	RemodelReleasePaymentListener(CancelPaymentPort cancelPaymentPort, MeterRegistry meters) {
		this.cancelPaymentPort = cancelPaymentPort;
		this.collected = meters.counter(ObservabilityMetrics.REMODEL_RELEASE_COLLECTED);
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
			case PaymentCancellation.NotCancellable notCancellable -> {
				collected.increment();
				log.error("booking {} was released by a remodel but its payment already succeeded ({}) — the guest "
						+ "has paid for a cancelled booking and is owed a refund by hand", bookingId,
						notCancellable.reason());
			}
			case PaymentCancellation.Failed failed -> throw new IllegalStateException(
					"could not void the intent of released booking " + bookingId + ": " + failed.reason());
		}
	}
}
