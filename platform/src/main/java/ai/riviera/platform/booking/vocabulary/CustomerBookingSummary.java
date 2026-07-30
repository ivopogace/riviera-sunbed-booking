package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * One row of "which bookings does this guest contact have" (#380) — what the admin mail-delivery view
 * lists after resolving an address, each row then carrying its own mail-attempt history.
 *
 * <p>Deliberately four fields, and deliberately <strong>not</strong> the booking's status. The view's
 * question is whether a confirmation mail was ever <em>due</em> for this booking, which
 * {@code everConfirmed} answers directly; publishing the lifecycle enum would put the whole
 * {@code BookingStatus} vocabulary on the module's surface to satisfy one consumer that needs a
 * boolean (the Need-To-Know rule). No arrival code and no contact details: the code is a bearer
 * credential (invariant #7), and the address is the caller's own input.
 *
 * @param bookingId the booking, and the key an admin resend is addressed to
 * @param venueId the venue, from which the view resolves a display name via {@code venue::api}
 * @param bookingDate the booked day, a {@code LocalDate} in {@code Europe/Tirane} (invariant #6)
 * @param everConfirmed whether this booking ever reached {@code CONFIRMED} — see
 *        {@link BookingConfirmationFacts#everConfirmed()} for why it is not a status test
 */
public record CustomerBookingSummary(BookingId bookingId, VenueId venueId, LocalDate bookingDate,
		boolean everConfirmed) {
}
