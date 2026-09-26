package ai.riviera.platform.notification.application;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.api.CustomerBookings;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CustomerBookingSummary;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Assembles the admin mail-delivery view: address → guest contact → that contact's bookings →
 * each booking's recorded mail attempts, with the venue name read live. The address stops at
 * {@code customer::api}; every later read is by id, so no contact PII reaches {@code booking}.
 *
 * <p>An unknown address and one with no bookings return the same empty list, never an "is this
 * address known" oracle. Attempts are read once per page and grouped in memory; the venue name
 * ({@code SetBookingFacts}) is the one per-row read, bounded by {@code CustomerBookings}' 20 cap.
 */
@Service
class MailDeliveryLookupService implements MailDeliveryLookup {

	/** Shown when a set does not resolve — the row is still worth listing for its attempt history. */
	private static final String UNKNOWN_VENUE = "Unknown venue";

	private final CustomerLookup customers;
	private final CustomerBookings customerBookings;
	private final ConfirmationMailAttempts attempts;
	private final SetBookingFacts sets;

	MailDeliveryLookupService(CustomerLookup customers, CustomerBookings customerBookings,
			ConfirmationMailAttempts attempts, SetBookingFacts sets) {
		this.customers = customers;
		this.customerBookings = customerBookings;
		this.attempts = attempts;
		this.sets = sets;
	}

	@Override
	public List<MailDeliveryBooking> forEmail(String email) {
		Optional<CustomerId> customer = customers.findByEmail(email);
		if (customer.isEmpty()) {
			return List.of();
		}
		List<CustomerBookingSummary> bookings = customerBookings.forCustomer(customer.get());
		if (bookings.isEmpty()) {
			return List.of();
		}
		Map<BookingId, List<MailAttempt>> history = attempts
				.historyFor(bookings.stream().map(CustomerBookingSummary::bookingId).toList())
				.stream()
				.collect(Collectors.groupingBy(MailAttempt::bookingId));
		return bookings.stream()
				.map(booking -> new MailDeliveryBooking(booking.bookingId(), venueName(booking.setId()),
						booking.bookingDate(), booking.everConfirmed(),
						history.getOrDefault(booking.bookingId(), List.of())))
				.toList();
	}

	private String venueName(SetId setId) {
		return sets.setBookingInfo(setId).map(SetBookingInfo::venueName).orElse(UNKNOWN_VENUE);
	}
}
