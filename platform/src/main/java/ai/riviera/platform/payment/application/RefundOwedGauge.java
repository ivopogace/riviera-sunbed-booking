package ai.riviera.platform.payment.application;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Publishes {@code riviera.refunds.owed} — how many bookings are still owed a refund the gateway
 * would not issue; returns to zero as bookings are settled.
 *
 * <p>The failure counter beside it counts observations (one stuck refund keeps emitting); this
 * counts debts. Read together, never summed. Rationale: RESPONSIBILITIES.md §payment.
 *
 * <p>{@link MeterRegistry} is a framework bean, not a cross-module dependency. Each scrape is a
 * count over the partial index that exists for it.
 */
@Component
class RefundOwedGauge {

	RefundOwedGauge(MeterRegistry meters, Payments payments) {
		Gauge.builder(ObservabilityMetrics.REFUNDS_OWED, payments, Payments::owedRefundCount)
				.description("Bookings still owed a refund the gateway would not issue")
				.register(meters);
	}
}
