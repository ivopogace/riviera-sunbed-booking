package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.venue.api.MoneyView;

/**
 * The {@code 200} response body for {@code GET /api/bookings/{code}} (U6) — the booking summary plus
 * the server-computed cancellation terms the Angular app renders. Money travels as {@link MoneyView}
 * (integer minor units + ISO currency, invariant #5); the date as an ISO {@code LocalDate} string.
 * {@code refundedAmount} is {@code null} unless the booking is already cancelled. Mirrors the FE
 * {@code BookingDetail} type.
 */
record BookingDetailView(String code, String status, long venueId, String venueName, String rowLabel,
		int positionNo, String bookingDate, MoneyView amount, boolean cancellable, boolean beforeCutoff,
		MoneyView refundIfCancelledNow, MoneyView refundedAmount) {

	static BookingDetailView of(BookingDetail d) {
		return new BookingDetailView(d.code(), d.status().name(), d.venueId().value(), d.venueName(),
				d.rowLabel(), d.positionNo(), d.bookingDate().toString(), d.amount(), d.cancellable(),
				d.beforeCutoff(), d.refundIfCancelledNow(), d.refundedAmount());
	}
}
