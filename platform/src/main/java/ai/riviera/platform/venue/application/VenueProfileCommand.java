package ai.riviera.platform.venue.application;

import java.util.Set;

import ai.riviera.platform.venue.vocabulary.Amenity;

/**
 * The validated command to replace a venue's profile fields (T7, issue #140): the amenity set (an
 * order-insensitive subset of the fixed {@link Amenity} catalogue) and the optional
 * distance-to-water in metres ({@code null} = not stated). Catalogue membership is enforced by the
 * {@link Amenity} type itself — the edge DTO parses codes to {@code Amenity}, so an off-catalogue
 * code never reaches here — and the positive-distance invariant is checked in the canonical
 * constructor. The set is defensively copied so it is immutable and order-insensitive.
 */
public record VenueProfileCommand(Set<Amenity> amenities, Integer distanceToWaterM) {

	public VenueProfileCommand {
		amenities = amenities == null ? Set.of() : Set.copyOf(amenities);
		if (distanceToWaterM != null && distanceToWaterM <= 0) {
			throw new IllegalArgumentException("distanceToWaterM must be a positive integer");
		}
	}
}
