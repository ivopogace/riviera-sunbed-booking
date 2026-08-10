package ai.riviera.platform.payment.application;

import java.util.Optional;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;

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
	 * The credentials of the booking's PaymentIntent while it is still {@code REQUIRES_PAYMENT}
	 * and a {@code client_secret} is on record (V19) — the pay-on-accept read (issue #98). Empty
	 * once the intent succeeded/failed/was canceled, or when no secret was stored (stub profile,
	 * pre-V19 rows).
	 */
	Optional<PaymentCredentials> findPendingCredentials(
			BookingRef booking);

	/**
	 * The booking a PaymentIntent collects for, or empty if no such PaymentIntent is known
	 * (e.g. an event for an intent this app did not create) — the webhook then ignores it.
	 */
	Optional<BookingRef> findBookingRefByIntent(String paymentIntentId);

	/**
	 * Apply a webhook-derived outcome to the PaymentIntent's record, guarded: only an <em>open</em>
	 * collection ({@code REQUIRES_PAYMENT} or {@code FAILED}, which is retryable at Stripe) moves, so
	 * a late or out-of-order event cannot overwrite a terminal one (invariant #8). Returns whether a
	 * row actually transitioned — {@code false} for a terminal record and for an unknown intent alike.
	 */
	boolean markStatus(String paymentIntentId, PaymentStatus status);

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

	/**
	 * The refund-relevant state of the booking's payment row — status plus {@code refunded_minor} —
	 * or empty when no row exists (the stub profile records no payment).
	 */
	Optional<RefundState> findRefundState(BookingRef booking);

	/**
	 * Un-record the refund {@code refundId} because the gateway reports it returned no money: clear
	 * {@code refunded_minor} and put the collection back to {@code SUCCEEDED}, which it still is.
	 * Guarded like {@link #markStatus}: only a row still carrying that refund id as a recorded refund
	 * moves, so a re-delivered failure — or one for a refund a later attempt has already replaced — is
	 * a no-op. Returns whether a row actually moved.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	boolean markRefundFailed(String refundId);
}
