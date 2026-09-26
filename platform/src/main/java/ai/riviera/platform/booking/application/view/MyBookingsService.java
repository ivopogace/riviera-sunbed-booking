package ai.riviera.platform.booking.application.view;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The list-my-bookings use case: load the account's bookings ({@link Bookings#findByAccountId},
 * account-scoped in SQL) and enrich them with venue + set display from {@code venue}'s
 * {@link SetBookingFacts} port (invariant #11, never a cross-module join), in <strong>one batch
 * call</strong> for the whole list. Package-private behind {@link MyBookings}; read-only.
 * A booking's set always resolves (FK {@code ON DELETE RESTRICT}; a booked set retires, ADR-0019);
 * a missing one fails loud rather than silently dropping the customer's booking.
 */
@Service
class MyBookingsService implements MyBookings {

	private final Bookings bookings;
	private final SetBookingFacts setFacts;

	MyBookingsService(Bookings bookings, SetBookingFacts setFacts) {
		this.bookings = bookings;
		this.setFacts = setFacts;
	}

	@Override
	public List<MyBookingSummary> forCustomer(CustomerAccountId accountId) {
		List<BookingRecord> records = bookings.findByAccountId(accountId);
		Set<SetId> setIds = records.stream().map(BookingRecord::setId).collect(Collectors.toSet());
		Map<SetId, SetBookingInfo> sets = setFacts.setBookingInfos(setIds);
		return records.stream()
				.map(b -> enrich(b, sets))
				.toList();
	}

	private MyBookingSummary enrich(BookingRecord b, Map<SetId, SetBookingInfo> sets) {
		// The set always resolves (FK ON DELETE RESTRICT, V5); fail loud on the impossible rather than
		// silently hide the booking (review F5).
		SetBookingInfo set = sets.get(b.setId());
		if (set == null) {
			throw new IllegalStateException(
					"booking references a set with no booking info: setId=" + b.setId().value());
		}
		return new MyBookingSummary(
				b.code(), b.status(), b.venueId(), set.venueName(), set.rowLabel(), set.positionNo(),
				b.bookingDate(), b.lastDate(), new MoneyView(b.amountMinor(), b.currency()), b.requestExpiresAt(),
				b.refundMinor() == null ? null : new MoneyView(b.refundMinor(), b.currency()), b.movedAt());
	}
}
