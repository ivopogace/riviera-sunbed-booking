package ai.riviera.platform.booking.application.view;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * One row of the signed-in "my bookings" list: {@code code} (bearer credential opening the detail
 * view, invariant #7), status, venue + set display, service days, gross {@code amount} (minor
 * units, invariant #5) and the Request-to-Book response deadline ({@code requestExpiresAt},
 * {@code null} for instant bookings). Not the full {@code BookingDetail}: refund terms load only in
 * the detail view. {@code refundedAmount} ({@code null} unless cancelled with a refund decision, as
 * on {@code BookingDetail}) lets the row avoid labelling a never-charged cancellation "Paid".
 */
public record MyBookingSummary(String code, BookingStatus status, VenueId venueId, String venueName,
		String rowLabel, int positionNo, LocalDate bookingDate, LocalDate lastDate, MoneyView amount,
		Instant requestExpiresAt,
		MoneyView refundedAmount, Instant movedAt) {
}
