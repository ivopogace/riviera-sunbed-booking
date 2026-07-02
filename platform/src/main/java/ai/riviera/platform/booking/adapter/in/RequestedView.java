package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The {@code 202 Accepted} response body for a Request-to-Book creation (issue #98): the same
 * booking summary as the {@code 201} confirmation, with status {@code PENDING_REQUEST} and the
 * venue-response deadline. Deliberately <strong>no</strong> {@code clientSecret}/
 * {@code paymentIntentId} — no payment exists until the venue accepts
 * (payment-request-on-accept); the guest checks status on the code-gated booking view and pays
 * from there once accepted. Money is integer minor units (invariant #5); the date an ISO
 * {@code LocalDate} string; the deadline an ISO-8601 UTC instant (invariant #6).
 */
record RequestedView(String code, String status, long venueId, String venueName, long setId,
		String rowLabel, int positionNo, String bookingDate, MoneyView amount,
		Instant requestExpiresAt) {

	static RequestedView of(BookingConfirmation confirmation, Instant requestExpiresAt) {
		SetBookingInfo set = confirmation.set();
		return new RequestedView(
				confirmation.code(), confirmation.status().name(),
				set.venueId().value(), set.venueName(), set.setId().value(),
				set.rowLabel(), set.positionNo(),
				confirmation.bookingDate().toString(), set.price(),
				requestExpiresAt);
	}
}
