package ai.riviera.platform.payment.application;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.stereotype.Service;

import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.api.RefundStatusLookup;
import ai.riviera.platform.payment.vocabulary.RefundProgress;
import ai.riviera.platform.payment.vocabulary.RefundResult;

/**
 * Executes the refund {@code booking} decided through the idempotency-keyed {@link PaymentGateway},
 * counting each {@link RefundResult.Failed} on {@code riviera.refunds.failed}; also answers
 * {@link RefundStatusLookup} from the {@link Payments} record.
 *
 * <p><strong>Records the attempt before asking the gateway, and must stay outside any caller's
 * transaction</strong> so a failure webhook arriving mid-call sees it and is not taken for a manual
 * gateway refund. Pinned by {@code RefundAttemptVisibilityIT}; {@code RESPONSIBILITIES.md} §payment.
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

	/**
	 * The booking's own share decides acceptance; the collection's status decides whether money was
	 * ever there — a sibling's refund may have moved the intent to {@code PARTIALLY_REFUNDED} while
	 * this booking is still owed in full.
	 */
	private static RefundProgress progressFrom(RefundState state) {
		if (state.refundedMinor() > 0) {
			return RefundProgress.ACCEPTED;
		}
		return state.status().holdsCollectedMoney()
				? RefundProgress.OUTSTANDING
				: RefundProgress.NO_COLLECTION;
	}
}
