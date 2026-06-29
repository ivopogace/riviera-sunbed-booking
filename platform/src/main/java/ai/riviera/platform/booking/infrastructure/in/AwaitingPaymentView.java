package ai.riviera.platform.booking.infrastructure.in;

import ai.riviera.platform.booking.application.in.BookingConfirmation;
import ai.riviera.platform.venue.api.MoneyView;
import ai.riviera.platform.venue.api.SetBookingInfo;

/**
 * The {@code 202 Accepted} response body when a booking is created under the {@code stripe}
 * profile: the same booking summary as the {@code 201} confirmation (status
 * {@code AWAITING_PAYMENT}) plus the Stripe {@code clientSecret} the browser uses to complete
 * the card payment with Stripe.js and the {@code paymentIntentId} for reference. Confirmation
 * itself arrives later via the signature-verified webhook (invariant #8), never this response.
 * Money is integer minor units (invariant #5); date is an ISO {@code LocalDate} string.
 */
record AwaitingPaymentView(String code, String status, long venueId, String venueName, long setId,
		String rowLabel, int positionNo, String bookingDate, MoneyView amount, String clientSecret,
		String paymentIntentId) {

	static AwaitingPaymentView of(BookingConfirmation confirmation, String clientSecret,
			String paymentIntentId) {
		SetBookingInfo set = confirmation.set();
		return new AwaitingPaymentView(
				confirmation.code(), confirmation.status().name(),
				set.venueId().value(), set.venueName(), set.setId().value(),
				set.rowLabel(), set.positionNo(),
				confirmation.bookingDate().toString(), set.price(),
				clientSecret, paymentIntentId);
	}
}
