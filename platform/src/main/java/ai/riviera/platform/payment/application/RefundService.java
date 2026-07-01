package ai.riviera.platform.payment.application;

import org.springframework.stereotype.Service;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.api.RefundResult;

/**
 * Implements the inbound {@link RefundPort} by delegating to the outbound {@link PaymentGateway} —
 * the refund sibling of {@code PaymentService}/{@code CheckoutPort} (one driving, one driven). The
 * gateway issues the refund (idempotency-keyed) and records it; this service keeps the seam thin.
 * Package-private; only the {@code api/} port is public (invariant #11). Constructor injection into
 * a {@code final} field (no Lombok, no field {@code @Autowired}).
 */
@Service
class RefundService implements RefundPort {

	private final PaymentGateway gateway;

	RefundService(PaymentGateway gateway) {
		this.gateway = gateway;
	}

	@Override
	public RefundResult refund(BookingRef booking, Money amount) {
		return gateway.refund(booking, amount);
	}
}
