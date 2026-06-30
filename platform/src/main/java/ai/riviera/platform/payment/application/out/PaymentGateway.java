package ai.riviera.platform.payment.application.out;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentCancellation;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.api.RefundResult;

/**
 * The module-internal <strong>outbound</strong> port for the actual payment provider — the
 * driven seam (riviera-stripe-payments). This is the project's gateway-agnostic boundary:
 * the domain depends on this interface, not on Stripe types. The default-profile
 * {@code StubPaymentGateway} returns {@link PaymentOutcome.Succeeded} in-process; the
 * {@code stripe}-profile {@code StripePaymentGateway} (U4) creates a PaymentIntent and returns
 * {@link PaymentOutcome.Pending} — the only seam that changes between the two.
 *
 * <p>Not part of the module's {@code api/} — only {@code payment}'s own application layer
 * depends on it (invariant #11).
 */
public interface PaymentGateway {

	/**
	 * Initiate collection of {@code amount} for the booking. Returns a typed outcome (never
	 * throws on a decline / expected failure): {@code Succeeded} when collected in-process
	 * (stub), {@code Pending} when a PaymentIntent was created and a signature-verified webhook
	 * will complete it (Stripe, invariant #8), or {@code Failed}.
	 */
	PaymentOutcome initiate(BookingRef booking, Money amount);

	/**
	 * Refund {@code amount} for the booking (U6). Server-initiated with an idempotency key derived
	 * from the booking id (invariant #8/#10): the stub succeeds in-process; the Stripe adapter
	 * creates a {@code Refund} against the booking's PaymentIntent and records it. Returns a typed
	 * outcome (never throws on an expected gateway failure / a missing collection).
	 */
	RefundResult refund(BookingRef booking, Money amount);

	/**
	 * Cancel the booking's PaymentIntent (issue #51) so Stripe stops retrying and the payment can no
	 * longer succeed. Reads the PaymentIntent's state first: a cancelable intent is canceled
	 * ({@code Canceled}), an already-canceled one is also {@code Canceled} (idempotent), a
	 * {@code succeeded} intent — or a booking with no collection on record — is
	 * {@code NotCancellable} (the caller must not cancel the booking), and a transient gateway error
	 * is {@code Failed}. Returns a typed outcome (never throws on an expected gateway failure). The
	 * stub voids in-process. No money moves — collect-only (invariant #8).
	 */
	PaymentCancellation cancel(BookingRef booking);
}
