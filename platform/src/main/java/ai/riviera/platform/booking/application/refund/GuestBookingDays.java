package ai.riviera.platform.booking.application.refund;

import java.util.List;

import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The admin day-refund lookup's outbound read: a guest contact's bookings with their service days'
 * stamps, newest booked date first, capped like {@code CustomerBookings} (20). The venue name is not
 * this port's: the row carries the set, resolved through {@code venue::api}. Implemented by
 * {@code JdbcGuestBookingDays} (invariant #1).
 */
public interface GuestBookingDays {

	/** The contact's bookings, every status, each with its days in date order; empty, never {@code null}. */
	List<GuestBookingRow> forCustomer(CustomerId customerId);
}
