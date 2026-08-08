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
 * each booking's recorded mail attempts, with the venue name read live.
 *
 * <p><strong>The address stops at {@code customer::api}.</strong> It is resolved to a
 * {@link CustomerId} and every subsequent read is by id, so no contact PII crosses into
 * {@code booking} or is stored by this module — the same posture as the confirmation mail itself.
 *
 * <p><strong>Unknown address and known-address-with-no-bookings return the same empty list.</strong>
 * Not laziness: a distinguishable answer would turn an admin surface into an "is this address known"
 * oracle, and the admin gains nothing from the distinction — either way there is no booking to act on.
 *
 * <p>Attempts are fetched in <strong>one</strong> read for the whole page and grouped in memory, rather
 * than per booking. The venue name is the one genuinely per-row read, and it goes through the same
 * {@code venue.api.SetBookingFacts} the mail body uses — bounded by the port's own 20-booking cap.
 */
@Service
class MailDeliveryLookupService implements MailDeliveryLookup {

	/** Shown when a set no longer resolves — the row is still worth listing for its attempt history. */
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
