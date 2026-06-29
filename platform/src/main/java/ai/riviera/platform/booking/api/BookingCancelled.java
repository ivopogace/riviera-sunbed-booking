package ai.riviera.platform.booking.api;

import java.time.LocalDate;

import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * Published when a booking transitions to {@code CANCELLED} (U6, issue #11) — the cancellation spine
 * fact other modules react to. The {@code payout} module consumes it and posts a REVERSAL sized to
 * the refund (ADR-0005); {@code availability} is freed and the refund issued <em>synchronously</em>
 * by {@code booking} (calling {@code availability::api} / {@code payment::api}) rather than via this
 * event, because those modules already sit downstream of {@code booking} and an event back to them
 * would cycle (invariant #11). So {@code payout} is the sole subscriber.
 *
 * <p>Id-based, immutable payload (invariant #11): technical ids ({@link BookingId}, {@link VenueId},
 * {@link SetId}) plus the cancellation facts — the {@code bookingDate} ({@code Europe/Tirane},
 * invariant #6) and the server-computed {@code refundMinor} in integer minor units + ISO
 * {@code currency} (invariants #5/#10). {@code refundMinor} drives the proportional reversal; the
 * original accrual is re-read by {@code payout}, not carried here.
 */
public record BookingCancelled(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, long refundMinor, String currency) {
}
