package ai.riviera.platform.booking.adapter.in;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.reserve.ConfirmBooking;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.payment.events.PaymentCanceled;
import ai.riviera.platform.payment.events.PaymentConfirmed;

/**
 * Applies {@code payment}'s webhook-verified events (invariant #8) to bookings, by event because a
 * back-call would cycle (invariant #11): {@link PaymentConfirmed} confirms an {@code AWAITING_PAYMENT}
 * booking; {@link PaymentCanceled} cancels it and, only if it transitioned, releases its
 * {@code (set, date)} claim (invariant #2). Each runs after the webhook commits, in its own
 * transaction; a throw leaves the publication outstanding until restart, so both stay idempotent.
 * Renaming the class or a handler changes its registry {@code listener_id} and orphans stored rows.
 */
@Component
class PaymentEventListener {

	private static final Logger log = LoggerFactory.getLogger(PaymentEventListener.class);

	private final ConfirmBooking confirmBooking;
	private final ReleaseAbandonedBooking releaseAbandonedBooking;
	private final Clock clock;

	PaymentEventListener(ConfirmBooking confirmBooking, ReleaseAbandonedBooking releaseAbandonedBooking,
			Clock clock) {
		this.confirmBooking = confirmBooking;
		this.releaseAbandonedBooking = releaseAbandonedBooking;
		this.clock = clock;
	}

	@ApplicationModuleListener
	void on(PaymentConfirmed event) {
		long bookingId = event.bookingRef().value();
		// The confirm seam transitions and publishes BookingConfirmed iff it actually transitioned,
		// so a re-delivery publishes nothing (idempotent — invariant #8 / #9).
		if (confirmBooking.confirmFromPayment(bookingId, clock.instant())) {
			log.info("confirmed booking {} from verified payment {}", bookingId,
					event.paymentIntentId());
		}
		else {
			// Already confirmed/cancelled or a re-delivery — benign no-op (invariant #8).
			log.debug("ignored already-applied confirmation for booking {}", bookingId);
		}
	}

	@ApplicationModuleListener
	void on(PaymentCanceled event) {
		long bookingId = event.bookingRef().value();
		// Shared guarded transition + release (also driven by the abandoned-payment sweep, issue #51):
		// a re-delivery or a booking the sweep already expired is a benign no-op, never a double release.
		if (releaseAbandonedBooking.release(new BookingId(bookingId))) {
			log.info("cancelled booking {} and released its set after payment cancellation", bookingId);
		}
	}
}
