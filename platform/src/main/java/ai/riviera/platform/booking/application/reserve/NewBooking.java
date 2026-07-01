package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The data needed to persist a brand-new booking row in {@code AWAITING_PAYMENT}. Cross-
 * aggregate references are by typed id (invariant #11 / Spring Data JDBC rule). The
 * {@code code} is the unguessable credential (invariant #7); the amount is integer minor
 * units + currency (invariant #5). A driven-port DTO — not exposed beyond {@code booking}.
 */
public record NewBooking(String code, VenueId venueId, SetId setId, CustomerId customerId,
		LocalDate bookingDate, long amountMinor, String amountCurrency) {
}
