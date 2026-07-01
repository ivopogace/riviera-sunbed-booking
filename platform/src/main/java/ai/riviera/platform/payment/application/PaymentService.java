package ai.riviera.platform.payment.application;

import org.springframework.stereotype.Service;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;

/**
 * Implements the inbound {@link CheckoutPort} by delegating to the outbound
 * {@link PaymentGateway} — the seam between "what booking asks for" (collect for this
 * booking) and "how it is collected" (stub now, Stripe in U4). Package-private; only the
 * {@code api/} port is public (invariant #11). Constructor injection into a {@code final}
 * field (no Lombok, no field {@code @Autowired}).
 */
@Service
class PaymentService implements CheckoutPort {

	private final PaymentGateway gateway;

	PaymentService(PaymentGateway gateway) {
		this.gateway = gateway;
	}

	@Override
	public PaymentOutcome pay(BookingRef booking, Money amount) {
		return gateway.initiate(booking, amount);
	}
}
