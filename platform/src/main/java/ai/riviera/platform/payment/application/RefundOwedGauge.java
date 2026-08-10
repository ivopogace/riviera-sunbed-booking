package ai.riviera.platform.payment.application;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Publishes {@code riviera.refunds.owed} — how many bookings are still owed a refund the gateway
 * would not issue.
 *
 * <p>It answers the question the failure counter beside it cannot: that counter records
 * <em>observations</em>, so one stuck refund produces a steady stream of them, and the delta since
 * the last check says "something is owed" rather than how much. This says how many, and returns to
 * zero as bookings are settled. Read together, never summed.
 *
 * <p>Self-observation of this module's own state ({@link MeterRegistry} is a framework bean, not a
 * cross-module dependency). Each scrape is a count over the partial index that exists for it.
 */
@Component
class RefundOwedGauge {

	RefundOwedGauge(MeterRegistry meters, Payments payments) {
		Gauge.builder(ObservabilityMetrics.REFUNDS_OWED, payments, Payments::owedRefundCount)
				.description("Bookings still owed a refund the gateway would not issue")
				.register(meters);
	}
}
