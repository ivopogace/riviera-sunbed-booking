package ai.riviera.platform.booking.api;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.CustomerBookingSummary;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The {@code booking} module's published <strong>bookings-of-one-guest</strong> query port: which
 * bookings belong to a guest-contact id. A separate consumer role from
 * {@link BookingNotificationFacts}, which serves a caller that already has a booking id. Its
 * consumer, {@code notification}'s admin mail-delivery view, resolves the address to a
 * {@link CustomerId} through {@code customer::api} first, so no contact PII crosses this port.
 * Read-only; touches no availability state (invariant #2). Rationale: RESPONSIBILITIES.md §booking.
 */
public interface CustomerBookings {

	/**
	 * This guest contact's bookings, newest booked date first, capped at the 20 most recent; empty,
	 * never {@code null}. Unfiltered by status: a booking that never reached {@code CONFIRMED} is
	 * exactly what explains an absent confirmation mail.
	 */
	List<CustomerBookingSummary> forCustomer(CustomerId customerId);
}
