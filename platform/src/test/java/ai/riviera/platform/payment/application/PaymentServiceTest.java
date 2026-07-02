package ai.riviera.platform.payment.application;

import java.util.function.BiFunction;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.payment.vocabulary.RefundResult;

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

	/** A {@link Payments} stub for the constructor — the delegation tests never read it. */
	private static Payments noPayments() {
		return new Payments() {
			@Override
			public void register(NewPayment payment) {
			}

			@Override
			public java.util.Optional<BookingRef> findBookingRefByIntent(String paymentIntentId) {
				return java.util.Optional.empty();
			}

			@Override
			public void markStatus(String paymentIntentId,
					ai.riviera.platform.payment.domain.PaymentStatus status) {
			}

			@Override
			public java.util.Optional<String> findIntentByBookingRef(BookingRef booking) {
				return java.util.Optional.empty();
			}

			@Override
			public void markRefunded(BookingRef booking, long refundedMinor, String refundId) {
			}

			@Override
			public java.util.Optional<ai.riviera.platform.payment.vocabulary.PaymentCredentials> findPendingCredentials(
					BookingRef booking) {
				return java.util.Optional.empty();
			}
		};
	}

	@Test
	void delegatesToGateway() {
		PaymentService service = new PaymentService(initiating((booking, amount) ->
				new PaymentOutcome.Succeeded("ref-" + booking.value() + "-" + amount.minor())), noPayments());

		PaymentOutcome outcome = service.pay(new BookingRef(42L), new Money(4500L, "EUR"));

		PaymentOutcome.Succeeded ok = assertInstanceOf(PaymentOutcome.Succeeded.class, outcome);
		assertEquals("ref-42-4500", ok.reference(), "service must pass booking + amount through unchanged");
	}

	@Test
	void passesPendingOutcomeThrough() {
		PaymentService service = new PaymentService(
				initiating((booking, amount) -> new PaymentOutcome.Pending("cs_test", "pi_test")), noPayments());

		PaymentOutcome outcome = service.pay(new BookingRef(1L), new Money(4500L, "EUR"));

		PaymentOutcome.Pending pending = assertInstanceOf(PaymentOutcome.Pending.class, outcome);
		assertEquals("cs_test", pending.clientSecret(), "the Stripe pending outcome passes through unchanged");
	}
}
