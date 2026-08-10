package ai.riviera.platform.payment.application;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.stereotype.Service;

import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.api.RefundStatusLookup;
import ai.riviera.platform.payment.vocabulary.RefundProgress;
import ai.riviera.platform.payment.vocabulary.RefundResult;

/**
 * Implements the inbound {@link RefundPort} by delegating to the outbound {@link PaymentGateway} —
 * the refund sibling of {@code PaymentService}/{@code CheckoutPort} (one driving, one driven). The
 * gateway issues the refund (idempotency-keyed) and records it; this service keeps the seam thin.
 * It also answers the read side of the same conversation, {@link RefundStatusLookup}, from the
 * {@link Payments} record — mirroring how {@code PaymentService} carries
 * {@code PaymentCredentialsLookup} beside {@code CheckoutPort}. Package-private; only the
 * {@code api/} ports are public (invariant #11).
 *
 * <p>Observability: a {@link RefundResult.Failed} — the gateway could not issue a
 * refund the platform owes a tourist — increments the money-path {@code riviera.refunds.failed}
 * counter. Self-observation of this module's own refund execution ({@link MeterRegistry} is a
 * framework bean, not a cross-module dependency); the alert self-check reads the counter. The metric
 * is measured here, not decided here — {@code booking} still owns whether/how much to refund.
 *
 * <p><strong>The attempt is recorded before the gateway is asked</strong>
 * ({@link Payments#markRefundAttempted}), and this method must stay outside a caller's transaction
 * for that write to be visible while the gateway call is still running — which is what lets a refund
 * failure arriving mid-call be told apart from a manual gateway refund. Pinned by
 * {@code RefundAttemptVisibilityIT}; rationale in {@code RESPONSIBILITIES.md} §{@code payment}.
 */
@Service
class RefundService implements RefundPort, RefundStatusLookup {

	private final PaymentGateway gateway;
	private final Counter failedRefunds;
	private final Payments payments;

	RefundService(PaymentGateway gateway, MeterRegistry meters, Payments payments) {
		this.gateway = gateway;
		this.failedRefunds = meters.counter(ObservabilityMetrics.REFUNDS_FAILED);
		this.payments = payments;
	}

	@Override
	public RefundResult refund(BookingRef booking, Money amount) {
		payments.markRefundAttempted(booking);
		RefundResult result = gateway.refund(booking, amount);
		if (result instanceof RefundResult.Failed) {
			failedRefunds.increment();
		}
		return result;
	}

	@Override
	public RefundProgress progressOf(BookingRef booking) {
		return payments.findRefundState(booking)
				.map(RefundService::progressFrom)
				.orElse(RefundProgress.NO_COLLECTION);
	}

	private static RefundProgress progressFrom(RefundState state) {
		if (state.refundedMinor() > 0) {
			return RefundProgress.ACCEPTED;
		}
		return state.status() == PaymentStatus.SUCCEEDED
				? RefundProgress.OUTSTANDING
				: RefundProgress.NO_COLLECTION;
	}
}
