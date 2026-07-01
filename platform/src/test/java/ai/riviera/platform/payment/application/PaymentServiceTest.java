package ai.riviera.platform.payment.application;

import java.util.function.BiFunction;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentCancellation;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.api.RefundResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * Unit test of the checkout seam (issue #6, AC-9): {@code PaymentService} delegates the
 * inbound {@code CheckoutPort} to the outbound {@link PaymentGateway} verbatim. In this
 * (same) package so the package-private service is the test surface; the gateway is a fake
 * (no Spring context, no DB). {@link PaymentGateway} now has two methods (initiate + refund),
 * so the fake is built from an initiate function with an unused refund.
 */
class PaymentServiceTest {

	/** A {@link PaymentGateway} whose {@code initiate} is the given function; {@code refund} is unused here. */
	private static PaymentGateway initiating(BiFunction<BookingRef, Money, PaymentOutcome> initiate) {
		return new PaymentGateway() {
			@Override
			public PaymentOutcome initiate(BookingRef booking, Money amount) {
				return initiate.apply(booking, amount);
			}

			@Override
			public RefundResult refund(BookingRef booking, Money amount) {
				throw new UnsupportedOperationException("not exercised by the checkout seam");
			}

			@Override
			public PaymentCancellation cancel(BookingRef booking) {
				throw new UnsupportedOperationException("not exercised by the checkout seam");
			}
		};
	}

	@Test
	void delegatesToGateway() {
		PaymentService service = new PaymentService(initiating((booking, amount) ->
				new PaymentOutcome.Succeeded("ref-" + booking.value() + "-" + amount.minor())));

		PaymentOutcome outcome = service.pay(new BookingRef(42L), new Money(4500L, "EUR"));

		PaymentOutcome.Succeeded ok = assertInstanceOf(PaymentOutcome.Succeeded.class, outcome);
		assertEquals("ref-42-4500", ok.reference(), "service must pass booking + amount through unchanged");
	}

	@Test
	void passesPendingOutcomeThrough() {
		PaymentService service = new PaymentService(
				initiating((booking, amount) -> new PaymentOutcome.Pending("cs_test", "pi_test")));

		PaymentOutcome outcome = service.pay(new BookingRef(1L), new Money(4500L, "EUR"));

		PaymentOutcome.Pending pending = assertInstanceOf(PaymentOutcome.Pending.class, outcome);
		assertEquals("cs_test", pending.clientSecret(), "the Stripe pending outcome passes through unchanged");
	}
}
