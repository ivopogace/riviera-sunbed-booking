package ai.riviera.platform.venue.adapter.in;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.application.VenueProfileCommand;

/**
 * The request body for editing a venue's profile ({@code PATCH /api/venues/{venueId}}, T7 #140):
 * the full amenity set (codes from the fixed {@link Amenity} catalogue) and the optional
 * distance-to-water in metres. {@link #toCommand()} parses each code to {@link Amenity} — an
 * unknown/null code is an {@link IllegalArgumentException} → {@code 400 INVALID_REQUEST} (the one
 * error contract, §6b) — and delegates the positive-distance invariant to {@link VenueProfileCommand}.
 *
 * <p><strong>The edit REPLACES the set</strong> (the editor always re-sends every selected amenity),
 * so a null/absent {@code amenities} clears them and a null {@code distanceToWaterM} clears the distance.
 */
record UpdateVenueProfileRequest(List<String> amenities, Integer distanceToWaterM) {

	VenueProfileCommand toCommand() {
		Set<Amenity> parsed = (amenities == null ? List.<String>of() : amenities).stream()
				.map(UpdateVenueProfileRequest::parseCode)
				.collect(Collectors.toUnmodifiableSet());
		return new VenueProfileCommand(parsed, distanceToWaterM);
	}

	private static Amenity parseCode(String code) {
		if (code == null) {
			throw new IllegalArgumentException("amenity code must not be null");
		}
		try {
			return Amenity.valueOf(code);
		}
		catch (IllegalArgumentException unknown) {
			// Translate to a safe, caller-facing message (never echo the raw enum-constant error).
			throw new IllegalArgumentException("Unknown amenity: " + code);
		}
	}
}
