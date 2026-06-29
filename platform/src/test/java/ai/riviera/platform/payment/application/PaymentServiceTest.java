package ai.riviera.platform.payment.application;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.application.out.PaymentGateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * Unit test of the checkout seam (issue #6, AC-9): {@code PaymentService} delegates the
 * inbound {@code CheckoutPort} to the outbound {@link PaymentGateway} verbatim. In this
 * (same) package so the package-private service is the test surface; the gateway is a lambda
 * fake — no Spring context, no DB.
 */
class PaymentServiceTest {

	@Test
	void delegatesToGateway() {
		PaymentGateway fake = (booking, amount) ->
				new PaymentOutcome.Succeeded("ref-" + booking.value() + "-" + amount.minor());
		PaymentService service = new PaymentService(fake);

		PaymentOutcome outcome = service.pay(new BookingRef(42L), new Money(4500L, "EUR"));

		PaymentOutcome.Succeeded ok = assertInstanceOf(PaymentOutcome.Succeeded.class, outcome);
		assertEquals("ref-42-4500", ok.reference(), "service must pass booking + amount through unchanged");
	}
}
