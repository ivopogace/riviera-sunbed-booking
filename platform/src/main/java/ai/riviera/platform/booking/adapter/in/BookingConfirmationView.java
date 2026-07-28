package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The {@code 201} response body for a created booking — everything the Angular app shows on
 * the confirmation screen. Money travels as {@link MoneyView} (integer minor units + ISO
 * currency, invariant #5); the date as an ISO {@code LocalDate} string. {@code emailWithheld} (#390)
 * tells the confirmation screen its "we've also emailed it to you" claim would be false, so it shows
 * the save-your-code notice instead. Mirrors the FE {@code BookingConfirmation} type.
 */
record BookingConfirmationView(String code, String status, long venueId, String venueName,
		long setId, String rowLabel, int positionNo, String bookingDate, MoneyView amount,
		boolean emailWithheld) {

	static BookingConfirmationView of(BookingConfirmation confirmation) {
		SetBookingInfo set = confirmation.set();
		return new BookingConfirmationView(
				confirmation.code(), confirmation.status().name(),
				set.venueId().value(), set.venueName(), set.setId().value(),
				set.rowLabel(), set.positionNo(),
				confirmation.bookingDate().toString(), set.price(), confirmation.emailWithheld());
	}
}
