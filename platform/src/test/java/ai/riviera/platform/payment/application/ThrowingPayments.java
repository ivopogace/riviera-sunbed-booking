package ai.riviera.platform.payment.application;

import java.util.Optional;

import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;

/**
 * A {@link Payments} test double where every method throws — instantiate as
 * {@code new ThrowingPayments() {}} when nothing should be read, or extend and override the one
 * method a test actually stubs.
 */
interface ThrowingPayments extends Payments {

	@Override
	default void register(NewPayment payment) {
		throw new UnsupportedOperationException("not stubbed by this test");
	}

	@Override
	default Optional<PaymentCredentials> findPendingCredentials(BookingRef booking) {
		throw new UnsupportedOperationException("not stubbed by this test");
	}

	@Override
	default Optional<BookingRef> findBookingRefByIntent(String paymentIntentId) {
		throw new UnsupportedOperationException("not stubbed by this test");
	}

	@Override
	default boolean markStatus(String paymentIntentId, PaymentStatus status) {
		throw new UnsupportedOperationException("not stubbed by this test");
	}

	@Override
	default Optional<String> findIntentByBookingRef(BookingRef booking) {
		throw new UnsupportedOperationException("not stubbed by this test");
	}

	@Override
	default void markRefunded(BookingRef booking, long refundedMinor, String refundId) {
		throw new UnsupportedOperationException("not stubbed by this test");
	}

	@Override
	default Optional<RefundState> findRefundState(BookingRef booking) {
		throw new UnsupportedOperationException("not stubbed by this test");
	}

	@Override
	default boolean markRefundFailed(String refundId) {
		throw new UnsupportedOperationException("not stubbed by this test");
	}
}
