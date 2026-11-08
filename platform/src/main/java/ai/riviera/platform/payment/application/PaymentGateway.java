package ai.riviera.platform.payment.application;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.payment.domain.RefundScope;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PayeeRef;
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
	 * Initiate one collection for every share (one currency), paying {@code payee}; never throws on a decline or
	 * expected failure. Returns {@code Succeeded} (stub), {@code Pending} (only the verified webhook completes it,
	 * invariant #8; its instruction tells the browser how to pay) or {@code Failed}.
	 */
	PaymentOutcome initiate(PayeeRef payee, List<CollectionShare> shares);

	/** Initiate collection of {@code amount} for one booking, paying {@code payee}: a collection of one share. */
	default PaymentOutcome initiate(PayeeRef payee, BookingRef booking, Money amount) {
		return initiate(payee, List.of(new CollectionShare(booking, payee, amount)));
	}

	/**
	 * Refund {@code amount} of this booking's share within {@code scope}; never throws on an expected
	 * gateway failure or a missing collection. <strong>At-most-once per booking and scope</strong>, even
	 * replayed past the idempotency-key window ({@code PaymentGatewayRefundContract}).
	 */
	RefundResult refund(BookingRef booking, RefundScope scope, Money amount);

	/** Refund {@code amount} of the whole share. */
	default RefundResult refund(BookingRef booking, Money amount) {
		return refund(booking, RefundScope.WHOLE, amount);
	}

	/**
	 * Void the booking's PaymentIntent so it can never succeed; never throws on an expected failure.
	 * {@code Canceled} also if already canceled (idempotent); {@code NotCancellable} if it succeeded or
	 * nothing was collected (the caller must not cancel the booking); {@code Failed} if transient.
	 */
	PaymentCancellation cancel(BookingRef booking);

	/**
	 * The provider's current answer for the payment {@code reference} paying {@code payee}, read with that venue's
	 * credentials where the provider has them; never throws on an expected failure ({@code PaymentGatewayLookupContract}).
	 */
	ProviderPaymentState lookup(PayeeRef payee, String reference);

	/** Every unpaid transaction created from {@code from} up to, not including, {@code before}, read to the last page; never throws on an expected failure. */
	UnpaidTransactions unpaidCreatedBetween(Instant from, Instant before);
}
