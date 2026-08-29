package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The facts the guarded {@code PENDING_REQUEST → AWAITING_PAYMENT} transition yields via SQL
 * {@code RETURNING} — the amount the payment request needs (fixed at request time, integer minor
 * units + ISO currency, invariant #5) and, since #373, everything the {@code BookingPaymentDue}
 * payload carries. Read atomically with the transition so no second query can race a concurrent
 * change, exactly as {@code ConfirmedBooking} does for the confirm seam.
 *
 * <p>{@code acceptedAt} is the transition's own stamp rather than the caller's clock reading. The
 * two are the same instant today — the service passes {@code now} in — but the mailed pay deadline
 * is computed from this field, and reading it back from the row that actually transitioned is what
 * keeps the deadline anchored to the {@code accepted_at} the sweep will later compare against.
 *
 * <p>{@code createdAt} is the booking's birth instant (#795), from which the payment-due mail's
 * cancellation-window-at-birth disclosure is classified — the birth, not the accept, keys it.
 */
public record AcceptedRequest(long bookingId, VenueId venueId, SetId setId, LocalDate bookingDate,
		Instant acceptedAt, Instant createdAt, long amountMinor, String currency) {
}
