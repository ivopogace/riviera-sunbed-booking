package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A booking that happened ({@code BookingStatus#stormDayRefundable}) whose span covers the washed-out
 * date, with what that day already holds: its id, the gross {@code amountMinor} paid (integer minor
 * units, invariant #5), its span and set, the stay it belongs to ({@code null} for a lone booking),
 * and whether the day is attended or already refunded. Read by {@link Bookings#findRefundableForWeather};
 * {@code WeatherRefundService} decides the leg. A thin read row, not the aggregate.
 */
public record RefundableBooking(long bookingId, long amountMinor, String currency, LocalDate bookingDate,
		LocalDate lastDate, SetId setId, StayId stayId, boolean dayAttended, boolean dayRefunded) {

	/** A lone one-day booking: today's whole-cancel leg; every other row is a day of a stay. */
	public boolean isLoneOneDay() {
		return stayId == null && !lastDate.isAfter(bookingDate);
	}
}
