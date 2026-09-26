package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The driven-port DTO to persist a brand-new booking row in {@code AWAITING_PAYMENT}; cross-module
 * references by typed id (invariant #11). The {@code code} is the unguessable credential
 * (invariant #7); {@code bookingDate} to {@code lastDate} is the span of service days, inclusive;
 * the amount is the stay's total in integer minor units + currency (invariant #5).
 * {@code accountId} is <strong>nullable</strong>: the signed-in tourist's {@link CustomerAccountId}
 * or {@code null} for a guest; distinct from {@code customerId}, the guest-contact row.
 */
public record NewBooking(String code, VenueId venueId, SetId setId, CustomerId customerId,
		CustomerAccountId accountId, LocalDate bookingDate, LocalDate lastDate, long amountMinor,
		String amountCurrency) {
}
