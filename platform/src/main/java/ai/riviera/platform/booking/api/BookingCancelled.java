package ai.riviera.platform.booking.api;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

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
 * invariant #6), the server-computed {@code refundMinor} in integer minor units + ISO
 * {@code currency} (invariants #5/#10), and the {@link RefundReason} (U9). {@code refundMinor} drives
 * the proportional reversal; {@code reason} is stamped on that reversal so the ledger stays auditable
 * (policy vs weather). The original accrual is re-read by {@code payout}, not carried here.
 */
public record BookingCancelled(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, long refundMinor, String currency, RefundReason reason) {
}
