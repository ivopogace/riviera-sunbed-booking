package ai.riviera.platform.payment.application;

import java.util.ArrayList;
import java.util.List;

import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * A {@link ThrowingPayments} that tolerates the one write the refund seam always performs — the
 * attempt record — and keeps a log of it, so a test can assert it happened and in what order.
 * Everything else still throws, so a test straying onto another read is still caught.
 */
final class AttemptRecordingPayments implements ThrowingPayments {

	private final List<String> calls;

	AttemptRecordingPayments() {
		this(new ArrayList<>());
	}

	AttemptRecordingPayments(List<String> calls) {
		this.calls = calls;
	}

	@Override
	public void markRefundAttempted(BookingRef booking) {
		calls.add("attempt:" + booking.value());
	}
}
