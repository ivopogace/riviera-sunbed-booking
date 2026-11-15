package ai.riviera.platform.booking.adapter.in;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;

/**
 * The {@code 201} response body for a created booking — the shared {@link CreatedBookingView}
 * summary plus {@code confirmationMail}, the {@code MailDisclosure} name the confirmation screen picks its mail
 * copy by: {@code UNDISCLOSED} for every reader but the address's verified owner (#1748).
 * Mirrors the FE {@code BookingConfirmation} type.
 */
record BookingConfirmationView(@JsonUnwrapped CreatedBookingView booking, String confirmationMail) {

	static BookingConfirmationView of(BookingConfirmation confirmation) {
		return new BookingConfirmationView(CreatedBookingView.of(confirmation),
				confirmation.confirmationMail().name());
	}
}
