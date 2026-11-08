package ai.riviera.platform.booking.adapter.in;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;
import ai.riviera.platform.payment.vocabulary.CheckoutInstruction;

/**
 * The {@code 202 Accepted} response body when a booking awaits payment: the shared
 * {@link CreatedBookingView} summary (status {@code AWAITING_PAYMENT}) plus {@code payment}, how the
 * browser completes it. Confirmation itself arrives later via the verified webhook (invariant #8),
 * never this response.
 */
record AwaitingPaymentView(@JsonUnwrapped CreatedBookingView booking, CheckoutInstructionView payment) {

	static AwaitingPaymentView of(BookingConfirmation confirmation, CheckoutInstruction instruction) {
		return new AwaitingPaymentView(CreatedBookingView.of(confirmation), CheckoutInstructionView.of(instruction));
	}
}
