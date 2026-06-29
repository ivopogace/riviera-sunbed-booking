package ai.riviera.platform.booking.infrastructure.in;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.payment.api.PaymentCanceled;
import ai.riviera.platform.payment.api.PaymentConfirmed;

/**
 * The {@code booking} module's reaction to verified Stripe payment events (U4) — a driving
 * adapter listening for facts the {@code payment} module announces (invariant #11: collaboration
 * by published event, never a back-call into {@code booking}, which would cycle).
 *
 * <p><strong>Synchronous</strong> {@code @EventListener}: it runs inside the webhook handler's
 * transaction, so the booking transition commits atomically with the webhook record and a
 * failure rolls both back (Stripe then re-delivers — at-least-once without a broker; the
 * registry-backed async spine is U5). Both handlers are <strong>idempotent</strong> (the
 * guarded transitions make a re-delivery a no-op), the second idempotency layer behind the
 * {@code stripe_webhook_event} dedup (invariant #8).
 *
 * <ul>
 *   <li>{@link PaymentConfirmed} → {@code AWAITING_PAYMENT → CONFIRMED}.</li>
 *   <li>{@link PaymentCanceled} → {@code AWAITING_PAYMENT → CANCELLED} and release the
 *       {@code (set, date)} availability claim so the set is re-bookable (invariant #2) — only
 *       when the booking actually transitioned.</li>
 * </ul>
 */
@Component
class PaymentEventListener {

	private static final Logger log = LoggerFactory.getLogger(PaymentEventListener.class);

	private final Bookings bookings;
	private final AvailabilityClaim availability;
	private final Clock clock;

	PaymentEventListener(Bookings bookings, AvailabilityClaim availability, Clock clock) {
		this.bookings = bookings;
		this.availability = availability;
		this.clock = clock;
	}

	@EventListener
	void on(PaymentConfirmed event) {
		long bookingId = event.bookingRef().value();
		if (bookings.confirmFromPayment(bookingId, clock.instant())) {
			log.info("confirmed booking {} from verified payment {}", bookingId,
					event.paymentIntentId());
		}
		else {
			// Already confirmed/cancelled or a re-delivery — benign no-op (invariant #8).
			log.debug("ignored already-applied confirmation for booking {}", bookingId);
		}
	}

	@EventListener
	void on(PaymentCanceled event) {
		long bookingId = event.bookingRef().value();
		bookings.cancelAwaitingPayment(bookingId).ifPresent(claim -> {
			availability.release(claim.setId(), claim.bookingDate());
			log.info("cancelled booking {} and released set {} on {} after payment cancellation",
					bookingId, claim.setId().value(), claim.bookingDate());
		});
	}
}
