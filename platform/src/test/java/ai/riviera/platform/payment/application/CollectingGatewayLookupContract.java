package ai.riviera.platform.payment.application;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * What a gateway that really collects owes on top: the lookup reports the provider's own record, and a paid
 * payment refuses the void, which is the abandoned-payment sweep's only check before it releases the set (#102).
 * {@code PaymentGatewayContractCoverageArchitectureTest} fails a collecting adapter with no subclass.
 */
public abstract class CollectingGatewayLookupContract extends PaymentGatewayLookupContract {

	protected static final BookingRef BOOKING = new BookingRef(4242L);

	/** The state the provider's record is arranged in. */
	protected enum Held {
		PAID, CANCELED, WAITING
	}

	/** The adapter, with the provider holding {@link #REFERENCE} (the payment of {@link #BOOKING}) as {@code held}. */
	protected abstract PaymentGateway gatewayHolding(Held held);

	/** The adapter, with the provider unreachable or refusing the read. */
	protected abstract PaymentGateway gatewayThatCannotRead();

	/** Fails if the provider was asked to void or cancel anything. */
	protected abstract void assertNothingWasVoided();

	@Override
	protected PaymentGateway gateway() {
		return gatewayHolding(Held.WAITING);
	}

	@Test
	void aPaidPaymentReadsPaid() {
		assertEquals(new ProviderPaymentState.Paid(), gatewayHolding(Held.PAID).lookup(PAYEE, REFERENCE));
	}

	@Test
	void aCanceledPaymentReadsCanceled() {
		assertEquals(new ProviderPaymentState.Canceled(), gatewayHolding(Held.CANCELED).lookup(PAYEE, REFERENCE));
	}

	@Test
	void anOpenPaymentReadsWaiting() {
		assertEquals(new ProviderPaymentState.Waiting(), gatewayHolding(Held.WAITING).lookup(PAYEE, REFERENCE));
	}

	@Test
	void anUnreadablePaymentReadsUnavailable() {
		assertInstanceOf(ProviderPaymentState.Unavailable.class, gatewayThatCannotRead().lookup(PAYEE, REFERENCE));
	}

	@Test
	void aPaidPaymentCannotBeVoided() {
		PaymentCancellation outcome = gatewayHolding(Held.PAID).cancel(BOOKING);

		assertInstanceOf(PaymentCancellation.NotCancellable.class, outcome,
				"the abandoned-payment sweep releases the set on anything but this answer");
		assertNothingWasVoided();
	}
}
