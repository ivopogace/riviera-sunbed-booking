package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The booking summary every creation outcome shares (#126) — the {@code 201} confirmation and
 * both {@code 202} bodies carry these nine fields identically. Composed into the outcome views
 * and flattened onto the wire with {@code @JsonUnwrapped}, so the JSON stays the flat shape the
 * frontend models and e2e mocks pin ({@code BookingCreationViewsContractTest}). Money is integer
 * minor units (invariant #5); the date an ISO {@code LocalDate} string.
 */
record CreatedBookingView(String code, String status, long venueId, String venueName, long setId,
		String rowLabel, int positionNo, String bookingDate, MoneyView amount) {

	static CreatedBookingView of(BookingConfirmation confirmation) {
		SetBookingInfo set = confirmation.set();
		return new CreatedBookingView(
				confirmation.code(), confirmation.status().name(),
				set.venueId().value(), set.venueName(), set.setId().value(),
				set.rowLabel(), set.positionNo(),
				confirmation.bookingDate().toString(), set.price());
	}
}
