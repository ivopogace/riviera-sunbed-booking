package ai.riviera.platform.booking.application.view;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.LiveRemainder;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The list-my-bookings use case: the account's bookings ({@link Bookings#findByAccountId}, account-scoped in SQL)
 * enriched with venue + set display from {@link SetBookingFacts} in <strong>one batch call</strong> (#11); a stay reads
 * as one booking, its nothing left the {@link LiveRemainder}'s, as on the detail. Read-only, behind {@link MyBookings}.
 * A booking's set always resolves (FK {@code ON DELETE RESTRICT}, ADR-0019); a missing one fails loud.
 */
@Service
class MyBookingsService implements MyBookings {

	private final Bookings bookings;
	private final SetBookingFacts setFacts;
	private final LiveRemainder liveRemainder;

	MyBookingsService(Bookings bookings, SetBookingFacts setFacts, LiveRemainder liveRemainder) {
		this.bookings = bookings;
		this.setFacts = setFacts;
		this.liveRemainder = liveRemainder;
	}

	@Override
	public List<MyBookingSummary> forCustomer(CustomerAccountId accountId) {
		List<Listed> listed = bookings.findByAccountId(accountId).stream().map(this::listed).toList();
		Set<SetId> setIds = listed.stream().map(l -> l.booking().setId()).collect(Collectors.toSet());
		Map<SetId, SetBookingInfo> sets = setFacts.setBookingInfos(setIds);
		return listed.stream()
				.map(l -> enrich(l.booking(), l.nothingLeft(), sets))
				.toList();
	}

	private Listed listed(AccountBooking entry) {
		return switch (entry) {
			case BookingRecord booking -> new Listed(booking, booking.everyDayRefunded());
			case StayRecord stay -> new Listed(stay.asBooking(), liveRemainder.of(stay).nothingLeft());
		};
	}

	/** A list entry read as one booking, with the detail page's nothing left. */
	private record Listed(BookingRecord booking, boolean nothingLeft) {
	}

	private MyBookingSummary enrich(BookingRecord b, boolean nothingLeft, Map<SetId, SetBookingInfo> sets) {
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
				b.refundMinor() == null ? null : new MoneyView(b.refundMinor(), b.currency()), b.movedAt(), nothingLeft);
	}
}
