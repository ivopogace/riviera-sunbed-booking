package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * A booked stay for the confirmation screen: the group's one {@code code} (invariant #7), its status,
 * venue, span, total (invariant #5) and each stretch with its set and money. {@code emailWithheld}
 * as on {@link BookingConfirmation}.
 */
public record StayConfirmation(String code, BookingStatus status, VenueId venueId, String venueName,
		StaySpan stay, MoneyView total, List<Stretch> stretches, boolean emailWithheld) {

	/** One stretch as booked: its set, where it sits, its days and its money. */
	public record Stretch(SetId setId, String rowLabel, int positionNo, LocalDate firstDay, LocalDate lastDay,
			MoneyView amount) {
	}
}
