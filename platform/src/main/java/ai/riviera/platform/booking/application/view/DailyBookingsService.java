package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.api.VenueRef;
import ai.riviera.platform.venue.api.VenueId;

/**
 * The staff daily-bookings use case (U8): list a venue's confirmed bookings for a day. A thin
 * read delegating straight to the {@link Bookings} port — package-private behind
 * {@link ListDailyBookings} (invariant #11); read-only, so no {@code @Transactional}. The booking
 * code is carried through untouched and never logged (invariant #7).
 *
 * <p>Per-venue authorization (invariant #13): the first act is {@link VenueOwnership#assertOwns} on
 * the acting operator, so booking codes for one venue never leak to another operator — the check is
 * here in the application service, not the controller.
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
		return bookings.findConfirmedForVenueOn(venueId, date);
	}
}
