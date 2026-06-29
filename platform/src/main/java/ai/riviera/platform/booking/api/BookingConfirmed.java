package ai.riviera.platform.booking.api;

import java.time.LocalDate;

import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * Published when a booking transitions to {@code CONFIRMED} — the write-side spine fact other
 * modules react to (U5, issue #9): {@code payout} accrues a ledger entry. Both confirm paths (the
 * synchronous stub and the async Stripe-webhook path) publish it from one internal seam
 * ({@code booking.application.in.ConfirmBooking}).
 *
 * <p>Id-based, immutable payload (invariant #11): technical ids ({@link BookingId}, {@link VenueId},
 * {@link SetId}) plus the booking facts fixed at confirmation — the {@code bookingDate} (a
 * {@code LocalDate} in {@code Europe/Tirane}, invariant #6) and the gross {@code amountMinor} in
 * integer minor units + ISO {@code currency} (invariant #5). No aggregates, no mutable config: the
 * commission rate is deliberately <em>not</em> carried here — {@code payout} re-reads it from
 * {@code venue::api} because it is mutable venue configuration, not a fact of this booking.
 */
public record BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, long amountMinor, String currency) {
}
