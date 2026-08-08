package ai.riviera.platform.booking.api;

import java.util.List;

import ai.riviera.platform.booking.vocabulary.CustomerBookingSummary;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The {@code booking} module's published <strong>bookings-of-one-guest</strong> query port —
 * which bookings belong to a guest-contact id, so a consumer that starts from a person can find the
 * booking it needs.
 *
 * <p>Split from {@link BookingNotificationFacts} by consumer role (the same split-by-consumer-role
 * rule, applied here rather than piling a second shape onto that port): {@code BookingNotificationFacts}
 * answers "tell the guest about <em>this</em> booking" for a caller that already has a booking id, while this port
 * answers "which bookings does this person have" for a caller that has only an address. Different
 * question, different caller, different port.
 *
 * <p>It lives here because {@code booking} owns the table — {@code customer}'s Not-My-Job list says so
 * in as many words ("Bookings → {@code booking}"). Its one consumer today is {@code notification}'s
 * admin mail-delivery view, which resolves the address to a {@link CustomerId} through
 * {@code customer::api} first, so no contact PII ever crosses this port.
 *
 * <p>Read-only: it touches no availability state (invariant #2) and writes nothing.
 */
public interface CustomerBookings {

	/**
	 * This guest contact's bookings, newest booked date first, capped at the 20 most recent — an
	 * unbounded read on a support surface is a hazard, and newest-first is what makes the cap safe.
	 * Empty (never {@code null}) when the guest has none.
	 *
	 * <p>Deliberately unfiltered by status: a booking that never reached {@code CONFIRMED} is exactly
	 * what explains an absent confirmation mail, so hiding it would remove the answer.
	 */
	List<CustomerBookingSummary> forCustomer(CustomerId customerId);
}
