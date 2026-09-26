package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;

import ai.riviera.platform.booking.application.view.MyBookingSummary;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * One row of {@code GET /api/me/bookings}, the signed-in "my bookings" list; a subset of the
 * code-gated {@code BookingDetailView}. Money as {@link MoneyView} (integer minor units + ISO
 * currency, invariant #5); dates as ISO {@code LocalDate} strings. {@code requestExpiresAt} is
 * {@code null} for instant bookings; {@code refundedAmount} is {@code null} unless cancelled with a
 * refund decision (so a never-charged cancellation never reads as paid); {@code movedAt} is set
 * when a remodel re-seated the booking.
 */
record MyBookingView(String code, String status, long venueId, String venueName, String rowLabel,
		int positionNo, String bookingDate, String lastDate, MoneyView amount, Instant requestExpiresAt,
		MoneyView refundedAmount, Instant movedAt) {

	static MyBookingView of(MyBookingSummary s) {
		return new MyBookingView(s.code(), s.status().name(), s.venueId().value(), s.venueName(),
				s.rowLabel(), s.positionNo(), s.bookingDate().toString(), s.lastDate().toString(), s.amount(),
				s.requestExpiresAt(),
				s.refundedAmount(), s.movedAt());
	}
}
