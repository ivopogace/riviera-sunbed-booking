package ai.riviera.platform.payment.application;

import java.util.Optional;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.domain.PaymentStatus;

/**
 * The {@code payment} module's outbound persistence port (driven seam) for the collection
 * record. Three narrow operations model the Stripe flow: {@code register} a PaymentIntent at
 * creation ({@code REQUIRES_PAYMENT}), {@code findBookingRefByIntent} to correlate a verified
 * webhook back to its booking, and {@code markStatus} to apply the webhook's outcome.
 * Implemented by {@code JdbcPayments} (explicit SQL, invariant #1); internal to the module.
 */
public interface Payments {

	/** Persist a new PaymentIntent record in {@code REQUIRES_PAYMENT}. */
	void register(NewPayment payment);

	/**
	 * The booking a PaymentIntent collects for, or empty if no such PaymentIntent is known
	 * (e.g. an event for an intent this app did not create) — the webhook then ignores it.
	 */
	Optional<BookingRef> findBookingRefByIntent(String paymentIntentId);

	/** Apply a webhook-derived status transition to the PaymentIntent's record. */
	void markStatus(String paymentIntentId, PaymentStatus status);

	/**
	 * The PaymentIntent id collecting for a booking, or empty if none is known (e.g. the stub
	 * profile records no payment). Used by the Stripe refund path to target the {@code Refund}.
	 */
	Optional<String> findIntentByBookingRef(BookingRef booking);

	/**
	 * Record a refund against the booking's collection (U6): set {@code refunded_minor} and the
	 * gateway {@code refundId}, and move the status to {@code REFUNDED} (fully refunded) or
	 * {@code PARTIALLY_REFUNDED} (a partial after-cutoff refund) — decided by comparing the refund to
	 * the collected amount. A 0-row no-op when no payment row exists (the stub profile).
	 */
	void markRefunded(BookingRef booking, long refundedMinor, String refundId);
}
