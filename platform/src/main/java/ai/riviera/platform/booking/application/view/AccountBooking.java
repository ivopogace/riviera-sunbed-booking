package ai.riviera.platform.booking.application.view;

/**
 * One entry of a customer account's bookings ({@code Bookings#findByAccountId}): a lone booking, or a stitched stay
 * with its stretches unfolded, so the list judges a stay's nothing left by the detail page's split (ADR-0024, #1425).
 */
public sealed interface AccountBooking permits BookingRecord, StayRecord {
}
