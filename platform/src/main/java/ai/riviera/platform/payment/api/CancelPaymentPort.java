package ai.riviera.platform.payment.api;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;

/**
 * The {@code payment} module's <strong>inbound</strong> published port for cancelling a booking's
 * PaymentIntent (issue #51) — the seam the {@code booking} module's abandoned-payment sweep calls
 * when a booking has lingered in {@code AWAITING_PAYMENT} past its TTL (a closed tab produces no
 * terminating webhook, so the PaymentIntent sits in {@code requires_payment_method} indefinitely).
 *
 * <p>Distinct from {@link CheckoutPort} (collection) and {@link RefundPort} (refund): all three are
 * driving ports {@code booking} calls, keeping the dependency direction {@code booking → payment::api}
 * (invariant #11). Cancelling voids an <strong>uncollected</strong> PaymentIntent — collect-only, no
 * Connect, no money moved (ADR-0002 / invariant #8).
 *
 * <p><strong>Idempotent.</strong> Cancelling an already-canceled PaymentIntent is a benign success;
 * a PaymentIntent that has already {@code succeeded} returns {@link PaymentCancellation.NotCancellable}
 * so the caller leaves the booking for the signature-verified confirm webhook (invariant #8). The
 * cancel reads the PaymentIntent's state from Stripe, never from the client.
 */
public interface CancelPaymentPort {

	/**
	 * Cancel the PaymentIntent collecting for {@code booking}. Returns a typed
	 * {@link PaymentCancellation} (never throws on an expected gateway failure / missing collection).
	 */
	PaymentCancellation cancel(BookingRef booking);
}
