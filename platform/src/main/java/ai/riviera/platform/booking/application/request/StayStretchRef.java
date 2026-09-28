package ai.riviera.platform.booking.application.request;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;

/** One pending stretch of a stay request: its booking, its set and its inclusive days. */
public record StayStretchRef(long bookingId, SetId setId, LocalDate firstDay, LocalDate lastDay) {

	StaySpan span() {
		return StaySpan.of(firstDay, lastDay);
	}
}
