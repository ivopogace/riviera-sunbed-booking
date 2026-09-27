package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.VenueId;

/** The data to insert a stay: its code (the guest's one credential, invariant #7), venue and span. */
public record NewStay(String code, VenueId venueId, LocalDate firstDay, LocalDate lastDay) {
}
