package ai.riviera.platform.booking.application.view;

import java.util.List;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The list-my-bookings use case (S3, #114): load the account's bookings ({@link Bookings#findByAccountId},
 * account-scoped in SQL) and enrich each with its venue + set display via the {@code venue} module's
 * {@link SetBookingFacts} api port (invariant #11 — the display names come from {@code venue}, never a
 * cross-module table join). Package-private behind the {@link MyBookings} port; read-only, no
 * {@code @Transactional}.
 *
 * <p>A booking's set always resolves — {@code booking.set_id} references {@code set_position} with
 * {@code ON DELETE RESTRICT} (V5), so a set holding bookings can't be removed — matching the
 * present-set assumption the code-gated detail view makes. An impossible missing set fails loud
 * rather than silently dropping the customer's (paid) booking (review F5).
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
		return bookings.findByAccountId(accountId).stream()
				.map(this::enrich)
				.toList();
	}

	private MyBookingSummary enrich(BookingRecord b) {
		// The set always resolves (FK ON DELETE RESTRICT, V5); fail loud on the impossible rather than
		// silently hide the booking (review F5).
		SetBookingInfo set = setFacts.setBookingInfo(b.setId())
				.orElseThrow(() -> new IllegalStateException(
						"booking references a set with no booking info: setId=" + b.setId().value()));
		return new MyBookingSummary(
				b.code(), b.status(), b.venueId(), set.venueName(), set.rowLabel(), set.positionNo(),
				b.bookingDate(), new MoneyView(b.amountMinor(), b.currency()), b.requestExpiresAt());
	}
}
