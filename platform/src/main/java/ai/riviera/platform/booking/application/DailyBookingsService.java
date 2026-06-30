package ai.riviera.platform.booking.application;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.in.DailyBooking;
import ai.riviera.platform.booking.application.in.ListDailyBookings;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.venue.api.VenueId;

/**
 * The staff daily-bookings use case (U8): list a venue's confirmed bookings for a day. A thin
 * read delegating straight to the {@link Bookings} port — package-private behind
 * {@link ListDailyBookings} (invariant #11); read-only, so no {@code @Transactional}. The booking
 * code is carried through untouched and never logged (invariant #7).
 */
@Service
class DailyBookingsService implements ListDailyBookings {

	private final Bookings bookings;

	DailyBookingsService(Bookings bookings) {
		this.bookings = bookings;
	}

	@Override
	public List<DailyBooking> forVenueOn(VenueId venueId, LocalDate date) {
		return bookings.findConfirmedForVenueOn(venueId, date);
	}
}
