package ai.riviera.platform.payment.application;

import org.springframework.stereotype.Service;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.CancelPaymentPort;
import ai.riviera.platform.payment.api.PaymentCancellation;
import ai.riviera.platform.payment.application.out.PaymentGateway;

/**
 * Implements the inbound {@link CancelPaymentPort} by delegating to the outbound
 * {@link PaymentGateway} — the seam between "what booking asks for" (cancel this booking's
 * PaymentIntent) and "how it is cancelled" (stub now, Stripe under the {@code stripe} profile).
 * Mirrors {@link PaymentService} / {@code RefundService}: package-private, only the {@code api/}
 * port is public (invariant #11), constructor injection into a {@code final} field.
 */
@Service
class PaymentCancelService implements CancelPaymentPort {

	private final PaymentGateway gateway;

	PaymentCancelService(PaymentGateway gateway) {
		this.gateway = gateway;
	}

	@Override
	public PaymentCancellation cancel(BookingRef booking) {
		return gateway.cancel(booking);
	}
}
