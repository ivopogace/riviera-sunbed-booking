package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/** A stay as stored: the group's code (invariant #7), venue and span, and its stretches' bookings in day order. */
public record StayRecord(StayId id, String code, VenueId venueId, LocalDate firstDay, LocalDate lastDay,
		List<BookingRecord> stretches) {

	public StayRecord {
		stretches = List.copyOf(stretches);
	}
}
