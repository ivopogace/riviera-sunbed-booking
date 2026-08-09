package ai.riviera.platform.booking.application.view;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * One row of the signed-in "my bookings" list (S3, #114): the booking summary the tourist's list
 * screen shows — {@code code} (the bearer credential opening the detail view, invariant #7),
 * {@code status}, the venue + set display ({@code venueName}, {@code rowLabel}, {@code positionNo}),
 * the {@code bookingDate}, the gross {@code amount} (integer minor units, invariant #5), and the
 * Request-to-Book venue-response deadline ({@code requestExpiresAt}, {@code null} for instant
 * bookings). A summary, not the full {@code BookingDetail} — the refund <em>terms</em> + payment
 * credentials are loaded only when a row is opened (the code-gated detail view).
 *
 * <p>{@code refundedAmount} is the exception, and is here for one reason: without it the row cannot
 * tell whether a {@code CANCELLED} booking ever took money, so it would label a never-charged
 * cancellation "Paid". It is {@code null} unless the booking was cancelled with a refund decision —
 * the same meaning it carries on {@code BookingDetail}. A pure value out of the use case.
 */
public record MyBookingSummary(String code, BookingStatus status, VenueId venueId, String venueName,
		String rowLabel, int positionNo, LocalDate bookingDate, MoneyView amount, Instant requestExpiresAt,
		MoneyView refundedAmount) {
}
