package ai.riviera.platform.payment.adapter.out;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentCancellation;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.api.RefundResult;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit test of the U3 stub gateway (issue #6): collection always succeeds and the reference
 * correlates to the booking. In the adapter's own package so the package-private class is the
 * test surface. No Stripe, no context.
 */
class StubPaymentGatewayTest {

	@Test
	void initiateAlwaysSucceeds() {
		StubPaymentGateway gateway = new StubPaymentGateway();

		PaymentOutcome outcome = gateway.initiate(new BookingRef(7L), new Money(3000L, "EUR"));

		PaymentOutcome.Succeeded ok = assertInstanceOf(PaymentOutcome.Succeeded.class, outcome);
		assertTrue(ok.reference().contains("7"), "reference correlates to the booking ref");
	}

	@Test
	void refundAlwaysSucceeds() {
		StubPaymentGateway gateway = new StubPaymentGateway();

		RefundResult result = gateway.refund(new BookingRef(7L), new Money(2250L, "EUR"));

		RefundResult.Refunded refunded = assertInstanceOf(RefundResult.Refunded.class, result);
		assertTrue(refunded.refundId().contains("7"), "refund id correlates to the booking ref");
	}

	@Test
	void cancelAlwaysSucceedsInProcess() {
		StubPaymentGateway gateway = new StubPaymentGateway();

		PaymentCancellation outcome = gateway.cancel(new BookingRef(7L));

		assertInstanceOf(PaymentCancellation.Canceled.class, outcome,
				"the stub voids in-process — the sweep runs only under the stripe profile");
	}
}
