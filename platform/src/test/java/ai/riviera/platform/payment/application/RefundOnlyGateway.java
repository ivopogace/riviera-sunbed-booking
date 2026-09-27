package ai.riviera.platform.payment.application;

import java.util.List;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;

/**
 * A {@link PaymentGateway} test double whose only abstract (hence lambda-targetable) method is
 * {@code refund}; the collection/cancel legs throw if a refund-seam test strays onto them.
 */
@FunctionalInterface
interface RefundOnlyGateway extends PaymentGateway {

	@Override
	default PaymentOutcome initiate(List<CollectionShare> shares) {
		throw new UnsupportedOperationException("not exercised by the refund seam");
	}

	@Override
	default PaymentCancellation cancel(BookingRef booking) {
		throw new UnsupportedOperationException("not exercised by the refund seam");
	}
}
