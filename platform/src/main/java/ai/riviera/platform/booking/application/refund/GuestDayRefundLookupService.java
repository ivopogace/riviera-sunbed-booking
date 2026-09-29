package ai.riviera.platform.booking.application.refund;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Assembles the admin's day-refund lookup: address → guest contact ({@code customer::api}, canonical
 * form applied there) → that contact's bookings and days → the venue names in one batched
 * {@code venue::api} read. An unknown address and one with no bookings answer the same empty list.
 */
@Service
class GuestDayRefundLookupService implements GuestDayRefundLookup {

	/** Shown when a set does not resolve — the row is still worth listing for its days. */
	private static final String UNKNOWN_VENUE = "Unknown venue";

	private final CustomerLookup customers;
	private final GuestBookingDays bookings;
	private final SetBookingFacts sets;

	GuestDayRefundLookupService(CustomerLookup customers, GuestBookingDays bookings, SetBookingFacts sets) {
		this.customers = customers;
		this.bookings = bookings;
		this.sets = sets;
	}

	@Override
	public List<GuestBooking> forEmail(String email) {
		Optional<CustomerId> customer = customers.findByEmail(email);
		if (customer.isEmpty()) {
			return List.of();
		}
		List<GuestBookingRow> rows = bookings.forCustomer(customer.get());
		if (rows.isEmpty()) {
			return List.of();
		}
		Map<SetId, SetBookingInfo> infos = sets.setBookingInfos(rows.stream().map(GuestBookingRow::setId).toList());
		return rows.stream()
				.map(row -> new GuestBooking(row.bookingId(),
						Optional.ofNullable(infos.get(row.setId())).map(SetBookingInfo::venueName).orElse(UNKNOWN_VENUE),
						row.firstDate(), row.lastDate(), row.status(), row.days()))
				.toList();
	}
}
