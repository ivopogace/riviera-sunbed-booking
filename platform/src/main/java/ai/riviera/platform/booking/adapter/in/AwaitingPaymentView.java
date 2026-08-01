package ai.riviera.platform.booking.adapter.in;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;

/**
 * The {@code 202 Accepted} response body when a booking is created under the {@code stripe}
 * profile: the shared {@link CreatedBookingView} summary (status {@code AWAITING_PAYMENT}) plus
 * the Stripe {@code clientSecret} the browser uses to complete the card payment with Stripe.js
 * and the {@code paymentIntentId} for reference. Confirmation itself arrives later via the
 * signature-verified webhook (invariant #8), never this response.
 */
record AwaitingPaymentView(@JsonUnwrapped CreatedBookingView booking, String clientSecret,
		String paymentIntentId) {

	static AwaitingPaymentView of(BookingConfirmation confirmation, String clientSecret,
			String paymentIntentId) {
		return new AwaitingPaymentView(CreatedBookingView.of(confirmation), clientSecret,
				paymentIntentId);
	}
}
