package ai.riviera.platform.booking.infrastructure.in;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.in.ConfirmBooking;
import ai.riviera.platform.booking.application.in.ReleaseAbandonedBooking;
import ai.riviera.platform.payment.api.PaymentCanceled;
import ai.riviera.platform.payment.api.PaymentConfirmed;

/**
 * The {@code booking} module's reaction to verified Stripe payment events (U4) — a driving
 * adapter listening for facts the {@code payment} module announces (invariant #11: collaboration
 * by published event, never a back-call into {@code booking}, which would cycle).
 *
 * <p><strong>Asynchronous</strong> {@code @ApplicationModuleListener} (= {@code @Async} +
 * {@code @Transactional} + {@code @TransactionalEventListener(AFTER_COMMIT)}): the publication is
 * persisted by the <em>Event Publication Registry</em> when the webhook transaction commits, then
 * this listener runs after commit in its <strong>own</strong> transaction. Durability no longer
 * depends on the webhook transaction rolling back — if this listener throws, the publication stays
 * incomplete in {@code event_publication} and is re-submitted (on restart, per
 * {@code spring.modulith.events.republish-outstanding-events-on-restart}); a normal completion is
 * archived (ARCHIVE mode). Because delivery is at-least-once, both handlers are
 * <strong>idempotent</strong> — the guarded transitions make a re-delivery a no-op, the second
 * idempotency layer behind the {@code stripe_webhook_event} event-id dedup (invariant #8).
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
