package ai.riviera.platform.payment.application.out;

import java.util.Optional;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.domain.PaymentStatus;

/**
 * The {@code payment} module's outbound persistence port (driven seam) for the collection
 * record. Three narrow operations model the Stripe flow: {@code record} a PaymentIntent at
 * creation ({@code REQUIRES_PAYMENT}), {@code findBookingRefByIntent} to correlate a verified
 * webhook back to its booking, and {@code markStatus} to apply the webhook's outcome.
 * Implemented by {@code JdbcPayments} (explicit SQL, invariant #1); internal to the module.
 */
public interface Payments {

	/** Persist a new PaymentIntent record in {@code REQUIRES_PAYMENT}. */
	void record(NewPayment payment);

	/**
	 * The booking a PaymentIntent collects for, or empty if no such PaymentIntent is known
	 * (e.g. an event for an intent this app did not create) — the webhook then ignores it.
	 */
	Optional<BookingRef> findBookingRefByIntent(String paymentIntentId);

	/** Apply a webhook-derived status transition to the PaymentIntent's record. */
	void markStatus(String paymentIntentId, PaymentStatus status);
}
