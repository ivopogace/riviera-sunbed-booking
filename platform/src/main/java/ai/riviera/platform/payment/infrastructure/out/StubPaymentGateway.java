package ai.riviera.platform.payment.infrastructure.out;

import org.springframework.stereotype.Component;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.application.out.PaymentGateway;

/**
 * U3 stub for the outbound {@link PaymentGateway}: collection always succeeds, synchronously
 * and in-process (no external call, so it is safe to run inside the booking's transaction).
 * This is the "stub payment gateway" of issue #6 — real Stripe collection (PaymentIntent +
 * signature-verified webhook, invariant #8) replaces this single class in U4.
 *
 * <p>Package-private; wired only as the {@link PaymentGateway} bean (invariant #11). No
 * Stripe types on the classpath here.
 */
@Component
class StubPaymentGateway implements PaymentGateway {

	private static final String REFERENCE_PREFIX = "stub-pi-";

	@Override
	public PaymentOutcome charge(BookingRef booking, Money amount) {
		return new PaymentOutcome.Succeeded(REFERENCE_PREFIX + booking.value());
	}
}
