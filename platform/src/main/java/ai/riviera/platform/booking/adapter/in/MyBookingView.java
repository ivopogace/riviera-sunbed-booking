package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;

import ai.riviera.platform.booking.application.view.MyBookingSummary;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * One item in the {@code 200} response of {@code GET /api/me/bookings} (S3, #114) — the signed-in
 * "my bookings" list row the Angular app renders. Money travels as {@link MoneyView} (integer minor
 * units + ISO currency, invariant #5); the date as an ISO {@code LocalDate} string;
 * {@code requestExpiresAt} is {@code null} for instant bookings. A subset of the code-gated
 * {@code BookingDetailView} — the fields the list needs (the detail view carries the rest).
 * {@code refundedAmount} is {@code null} unless the booking was cancelled with a refund decision; the
 * list needs it to avoid labelling a never-charged cancellation as paid. {@code movedAt} is set when a
 * remodel re-seated the booking, so the row can say the spot changed.
 */
record MyBookingView(String code, String status, long venueId, String venueName, String rowLabel,
		int positionNo, String bookingDate, MoneyView amount, Instant requestExpiresAt,
		MoneyView refundedAmount, Instant movedAt) {

	static MyBookingView of(MyBookingSummary s) {
		return new MyBookingView(s.code(), s.status().name(), s.venueId().value(), s.venueName(),
				s.rowLabel(), s.positionNo(), s.bookingDate().toString(), s.amount(), s.requestExpiresAt(),
				s.refundedAmount(), s.movedAt());
	}
}
