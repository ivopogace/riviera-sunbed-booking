package ai.riviera.platform.payment.application;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.RefundResult;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AC-5: a refund the gateway could not issue ({@link RefundResult.Failed}) increments
 * the {@code riviera.refunds.failed} money-path counter, while a successful refund does not. A plain
 * unit test — {@code RefundService} takes a {@link SimpleMeterRegistry} and a fake gateway; no Spring
 * context, no Docker. Same package as {@code RefundService} (package-private).
 */
class RefundFailureMetricTest {

	private static final BookingRef BOOKING = new BookingRef(42L);
	private static final Money AMOUNT = new Money(1500L, "EUR");

	private final SimpleMeterRegistry meters = new SimpleMeterRegistry();

	private double failedRefundCount() {
		return meters.counter(ObservabilityMetrics.REFUNDS_FAILED).count();
	}

	private RefundService service(RefundOnlyGateway gateway) {
		return new RefundService(gateway, meters, new AttemptRecordingPayments());
	}

	@Test
	void aFailedRefundIncrementsTheCounter() {
		RefundService service = service((booking, amount) -> new RefundResult.Failed("gateway_error"));

		RefundResult result = service.refund(BOOKING, AMOUNT);

		assertEquals(RefundResult.Failed.class, result.getClass());
		assertEquals(1.0, failedRefundCount());
	}

	@Test
	void aSuccessfulRefundDoesNotIncrementTheCounter() {
		RefundService service = service((booking, amount) -> new RefundResult.Refunded("re_test_123"));

		service.refund(BOOKING, AMOUNT);

		assertEquals(0.0, failedRefundCount());
	}
}
