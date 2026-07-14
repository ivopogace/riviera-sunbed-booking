package ai.riviera.platform.booking.application.view;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * The list-my-bookings use case (S3, #114): load the account's bookings ({@link Bookings#findByAccountId},
 * account-scoped in SQL) and enrich each with its venue + set display via the {@code venue} module's
 * {@link SetBookingFacts} api port (invariant #11 — the display names come from {@code venue}, never a
 * cross-module table join). Package-private behind the {@link MyBookings} port; read-only, no
 * {@code @Transactional}.
 *
 * <p>A booking whose set no longer exists (repriced-away / removed layout) yields no display facts and
 * is dropped from the list — the same present-set assumption the code-gated detail view makes, made
 * defensive here for a batch.
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
				.flatMap(Optional::stream)
				.toList();
	}

	private Optional<MyBookingSummary> enrich(BookingRecord b) {
		return setFacts.setBookingInfo(b.setId()).map(set -> new MyBookingSummary(
				b.code(), b.status(), b.venueId(), set.venueName(), set.rowLabel(), set.positionNo(),
				b.bookingDate(), new MoneyView(b.amountMinor(), b.currency()), b.requestExpiresAt()));
	}
}
