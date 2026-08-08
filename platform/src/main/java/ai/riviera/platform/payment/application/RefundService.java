package ai.riviera.platform.payment.application;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.stereotype.Service;

import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.vocabulary.RefundResult;

/**
 * Implements the inbound {@link RefundPort} by delegating to the outbound {@link PaymentGateway} —
 * the refund sibling of {@code PaymentService}/{@code CheckoutPort} (one driving, one driven). The
 * gateway issues the refund (idempotency-keyed) and records it; this service keeps the seam thin.
 * Package-private; only the {@code api/} port is public (invariant #11). Constructor injection into
 * {@code final} fields (no Lombok, no field {@code @Autowired}).
 *
 * <p>Observability: a {@link RefundResult.Failed} — the gateway could not issue a
 * refund the platform owes a tourist — increments the money-path {@code riviera.refunds.failed}
 * counter. Self-observation of this module's own refund execution ({@link MeterRegistry} is a
 * framework bean, not a cross-module dependency); the alert self-check reads the counter. The metric
 * is measured here, not decided here — {@code booking} still owns whether/how much to refund.
 */
@Service
class RefundService implements RefundPort {

	private final PaymentGateway gateway;
	private final Counter failedRefunds;

	RefundService(PaymentGateway gateway, MeterRegistry meters) {
		this.gateway = gateway;
		this.failedRefunds = meters.counter(ObservabilityMetrics.REFUNDS_FAILED);
	}

	@Override
	public RefundResult refund(BookingRef booking, Money amount) {
		RefundResult result = gateway.refund(booking, amount);
		if (result instanceof RefundResult.Failed) {
			failedRefunds.increment();
		}
		return result;
	}
}
