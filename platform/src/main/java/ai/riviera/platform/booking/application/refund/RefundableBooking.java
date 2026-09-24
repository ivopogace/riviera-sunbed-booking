package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;

/**
 * A {@code CONFIRMED} or swept {@code NO_SHOW} booking whose span covers the washed-out date: its id,
 * the gross {@code amountMinor} paid (integer minor units, invariant #5) and its span. Read by
 * {@link Bookings#findRefundableForWeather}; {@code WeatherRefundService} refunds a one-day booking in
 * full through the guarded {@link Bookings#cancelForWeather} and only <em>names</em> a stay. A thin
 * read row, not the aggregate.
 */
public record RefundableBooking(long bookingId, long amountMinor, LocalDate bookingDate, LocalDate lastDate) {

	/** A stay: more than one service day, so a whole-booking refund would overpay the storm. */
	public boolean spansSeveralDays() {
		return lastDate.isAfter(bookingDate);
	}
}
