package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The facts the guarded {@code PENDING_REQUEST → AWAITING_PAYMENT} transition yields via SQL
 * {@code RETURNING}: the amount (fixed at request time, integer minor units + ISO currency,
 * invariant #5) and everything the {@code BookingPaymentDue} payload carries, read atomically with
 * the transition so no second query can race a concurrent change. {@code acceptedAt} is the row's
 * own stamp, never the caller's clock, so the mailed pay deadline anchors to the
 * {@code accepted_at} the sweep compares against; {@code createdAt} keys the window-at-birth mail.
 */
public record AcceptedRequest(long bookingId, VenueId venueId, SetId setId, LocalDate bookingDate,
		Instant acceptedAt, Instant createdAt, long amountMinor, String currency) {
}
