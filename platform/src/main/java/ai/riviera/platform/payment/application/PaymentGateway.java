package ai.riviera.platform.payment.application;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.payment.vocabulary.RefundResult;

/**
 * The module-internal <strong>outbound</strong> port to the payment provider, and the
 * gateway-agnostic boundary: the domain depends on it, never on Stripe types (riviera-stripe-payments).
 * The default-profile {@code StubPaymentGateway} returns {@link PaymentOutcome.Succeeded} in-process;
 * the {@code stripe}-profile {@code StripePaymentGateway} creates a PaymentIntent and returns
 * {@link PaymentOutcome.Pending}. Not in {@code api/}: only {@code payment}'s own application layer
 * depends on it (invariant #11).
 */
public interface PaymentGateway {

	/**
	 * Initiate collection of {@code amount}; never throws on a decline or expected failure. Returns
	 * {@code Succeeded} (stub, in-process), {@code Pending} (a PaymentIntent exists and only the
	 * signature-verified webhook completes it, invariant #8) or {@code Failed}.
	 */
	PaymentOutcome initiate(BookingRef booking, Money amount);

	/**
	 * Refund {@code amount} for this booking; never throws on an expected gateway failure or a
	 * missing collection. <strong>At-most-once per booking</strong> for any collecting adapter, even
	 * replayed past the idempotency-key window: {@code PaymentGatewayRefundContract} enforces it.
	 */
	RefundResult refund(BookingRef booking, Money amount);

	/**
	 * Void the booking's PaymentIntent so it can never succeed; never throws on an expected failure.
	 * {@code Canceled} also if already canceled (idempotent); {@code NotCancellable} if it succeeded or
	 * nothing was collected (the caller must not cancel the booking); {@code Failed} if transient.
	 */
	PaymentCancellation cancel(BookingRef booking);
}
