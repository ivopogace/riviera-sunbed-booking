package ai.riviera.platform.booking.events;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * Raised by {@code PaymentDueAnnouncer} after an accept leaves the guest owing money (booking
 * {@code AWAITING_PAYMENT}, gateway {@code Pending}), never on a stub-confirmed or reverted accept: it
 * is not "request accepted". Id-based (invariant #11); the booking code is deliberately absent, as the
 * registry would persist it in cleartext (invariant #7). {@code bookingDate} is Tirane-local (#6), money
 * is minor units + ISO currency (#5), {@code payBy} the UTC pay deadline from {@code RequestWindows}.
 * The birth-window fields are stamped facts; a null window (older payloads) renders no disclosure.
 */
public record BookingPaymentDue(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, Instant payBy, long amountMinor, String currency,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {
}
