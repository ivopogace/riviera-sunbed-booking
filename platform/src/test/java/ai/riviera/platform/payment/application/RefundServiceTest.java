package ai.riviera.platform.payment.application;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentCancellation;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.api.RefundResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * Unit test of the refund seam (U6): {@code RefundService} delegates the inbound {@code RefundPort}
 * to the outbound {@link PaymentGateway} verbatim (the refund sibling of {@code PaymentService}). In
 * the same package so the package-private service is the test surface; the gateway is a fake.
 */
class RefundServiceTest {

	@Test
	void delegatesRefundToGateway() {
		PaymentGateway fake = new PaymentGateway() {
			@Override
			public PaymentOutcome initiate(BookingRef booking, Money amount) {
				throw new UnsupportedOperationException("not exercised by the refund seam");
			}

			@Override
			public RefundResult refund(BookingRef booking, Money amount) {
				return new RefundResult.Refunded("re-" + booking.value() + "-" + amount.minor());
			}

			@Override
			public PaymentCancellation cancel(BookingRef booking) {
				throw new UnsupportedOperationException("not exercised by the refund seam");
			}
		};
		RefundService service = new RefundService(fake);

		RefundResult result = service.refund(new BookingRef(42L), new Money(2250L, "EUR"));

		RefundResult.Refunded refunded = assertInstanceOf(RefundResult.Refunded.class, result);
		assertEquals("re-42-2250", refunded.refundId(), "service passes booking + amount through unchanged");
	}
}
