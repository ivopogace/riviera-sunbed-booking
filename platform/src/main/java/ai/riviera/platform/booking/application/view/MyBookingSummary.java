package ai.riviera.platform.booking.application.view;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * One row of the signed-in "my bookings" list: {@code code} (bearer credential, invariant #7), status, venue + set
 * display, service days, gross {@code amount} (minor units, #5), the request deadline ({@code null} when instant).
 * Refund terms load only in the detail; {@code refundedAmount} ({@code null} unless cancelled with a refund decision)
 * keeps a never-charged cancellation from reading "Paid"; {@code nothingLeft} is the detail's (ADR-0026 §7).
 */
public record MyBookingSummary(String code, BookingStatus status, VenueId venueId, String venueName,
		String rowLabel, int positionNo, LocalDate bookingDate, LocalDate lastDate, MoneyView amount,
		Instant requestExpiresAt,
		MoneyView refundedAmount, Instant movedAt, boolean nothingLeft) {
}
