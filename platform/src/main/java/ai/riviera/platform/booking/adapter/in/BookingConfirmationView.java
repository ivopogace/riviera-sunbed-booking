package ai.riviera.platform.booking.adapter.in;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;

/**
 * The {@code 201} response body for a created booking — the shared {@link CreatedBookingView}
 * summary plus {@code emailWithheld}, which tells the confirmation screen its "we've also
 * emailed it to you" claim would be false, so it shows the save-your-code notice instead. Only
 * this body carries the flag (D-8 — the pre-payment outcomes must not leak suppression status).
 * Mirrors the FE {@code BookingConfirmation} type.
 */
record BookingConfirmationView(@JsonUnwrapped CreatedBookingView booking, boolean emailWithheld) {

	static BookingConfirmationView of(BookingConfirmation confirmation) {
		return new BookingConfirmationView(CreatedBookingView.of(confirmation),
				confirmation.emailWithheld());
	}
}
