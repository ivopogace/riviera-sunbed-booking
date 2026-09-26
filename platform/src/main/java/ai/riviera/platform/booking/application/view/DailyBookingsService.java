package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The staff daily-bookings use case: list a venue's settled bookings for a day. A thin read
 * delegating to the {@link Bookings} port behind {@link ListDailyBookings}; read-only, so no
 * {@code @Transactional}. The booking code is carried through untouched and never logged (#7).
 *
 * <p>Per-venue authorization (invariant #13): the first act is
 * {@link VenueOwnership#assertOwns}, so one venue's booking codes never leak to another operator —
 * here, never in the controller.
 */
@Service
class DailyBookingsService implements ListDailyBookings {

	private final Bookings bookings;
	private final VenueOwnership ownership;

	DailyBookingsService(Bookings bookings, VenueOwnership ownership) {
		this.bookings = bookings;
		this.ownership = ownership;
	}

	@Override
	public List<DailyBooking> forVenueOn(OperatorId operator, VenueId venueId, LocalDate date) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		return bookings.findSettledForVenueOn(venueId, date);
	}
}
