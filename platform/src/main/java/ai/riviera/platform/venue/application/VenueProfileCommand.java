package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.Set;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.Beach;
import ai.riviera.platform.venue.vocabulary.VenueLocation;

/**
 * The validated full replace of a venue's operator-editable profile, so {@code null} clears an
 * optional field: no distance stated, no map pin (off the riviera map, still listed), any stay
 * length. Times are {@code Europe/Tirane} wall-clock (#4/#6); the beach's region is derived, never
 * an input; amenities are copied to an immutable set. Commission (#9) and payout currency are
 * deliberately absent, so a crafted request cannot write them. Catalogue, sales-close and location
 * bounds are enforced by their own types, the rest via {@link VenueFieldValidation}.
 */
public record VenueProfileCommand(String name, Beach beach, String description,
		String bookingMode, LocalTime bookingCutoff, SalesClose salesClose, Set<Amenity> amenities,
		Integer distanceToWaterM, VenueLocation location, Integer maxStayDays) {

	public VenueProfileCommand {
		VenueFieldValidation.requireText(name, "name");
		VenueFieldValidation.requireBeach(beach);
		VenueFieldValidation.requireBookingMode(bookingMode);
		VenueFieldValidation.requireCutoff(bookingCutoff);
		VenueFieldValidation.requireSalesClose(salesClose);
		VenueFieldValidation.requirePositiveOrNullDistance(distanceToWaterM);
		VenueFieldValidation.requirePositiveOrNullMaxStay(maxStayDays);
		amenities = amenities == null ? Set.of() : Set.copyOf(amenities);
	}
}
