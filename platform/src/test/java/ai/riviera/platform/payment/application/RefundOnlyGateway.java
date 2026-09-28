package ai.riviera.platform.payment.application;

import java.util.List;

import ai.riviera.platform.payment.domain.RefundScope;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.payment.vocabulary.RefundResult;

/**
 * A {@link PaymentGateway} test double whose only abstract (hence lambda-targetable) method is
 * the whole-share {@code refund}, which the scoped one delegates to; the collection/cancel legs throw
 * if a refund-seam test strays onto them.
 */
@FunctionalInterface
interface RefundOnlyGateway extends PaymentGateway {

	@Override
	RefundResult refund(BookingRef booking, Money amount);

	@Override
	default RefundResult refund(BookingRef booking, RefundScope scope, Money amount) {
		return refund(booking, amount);
	}

	@Override
	default PaymentOutcome initiate(List<CollectionShare> shares) {
		throw new UnsupportedOperationException("not exercised by the refund seam");
	}

	@Override
	default PaymentCancellation cancel(BookingRef booking) {
		throw new UnsupportedOperationException("not exercised by the refund seam");
	}
}
