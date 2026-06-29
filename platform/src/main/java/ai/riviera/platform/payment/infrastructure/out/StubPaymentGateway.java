package ai.riviera.platform.payment.infrastructure.out;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.payment.api.RefundResult;
import ai.riviera.platform.payment.application.out.PaymentGateway;

/**
 * Default-profile stub for the outbound {@link PaymentGateway}: collection always succeeds,
 * synchronously and in-process (no external call, so it is safe to run inside the booking's
 * transaction). This keeps dev/CI and the U3 synchronous flow green; the {@code stripe}-profile
 * {@code StripePaymentGateway} (U4) does the real PaymentIntent + signature-verified webhook
 * collection (invariant #8).
 *
 * <p>{@code @Profile("!stripe")} so exactly one {@link PaymentGateway} bean exists: the stub
 * when the {@code stripe} profile is absent, the Stripe adapter when it is present.
 * Package-private (invariant #11). No Stripe types here.
 */
@Component
@Profile("!stripe")
class StubPaymentGateway implements PaymentGateway {

	private static final String REFERENCE_PREFIX = "stub-pi-";
	private static final String REFUND_PREFIX = "stub-re-";

	@Override
	public PaymentOutcome initiate(BookingRef booking, Money amount) {
		return new PaymentOutcome.Succeeded(REFERENCE_PREFIX + booking.value());
	}

	@Override
	public RefundResult refund(BookingRef booking, Money amount) {
		// In-process success — the stub collected nothing real, so there is nothing to record.
		return new RefundResult.Refunded(REFUND_PREFIX + booking.value());
	}
}
