package ai.riviera.platform.venue.adapter.in;

import java.time.format.DateTimeFormatter;
import java.util.List;

import ai.riviera.platform.venue.application.VenueProfileView;
import ai.riviera.platform.venue.vocabulary.Amenity;

/**
 * The wire response for {@code GET /api/venues/{venueId}/profile} (O8, issue #177): the owner's
 * venue-admin profile. Maps the application {@link VenueProfileView} to the shape the console form
 * consumes — booking mode + amenity codes as their token strings, and the cutoff as {@code "HH:mm"}
 * (matching {@code CreateVenueRequest.bookingCutoff}), so the round-trip to the widened
 * {@code PATCH} is symmetric. {@code commissionBps} and {@code payoutCurrency} are display-only.
 */
record VenueProfileResponse(String name, String beach, String region, String description,
		String bookingMode, String bookingCutoff, int commissionBps, String payoutCurrency,
		List<String> amenities, Integer distanceToWaterM) {

	/** {@code "HH:mm"} to match the write DTO's cutoff shape (drops the always-zero seconds of a TIME). */
	private static final DateTimeFormatter CUTOFF = DateTimeFormatter.ofPattern("HH:mm");

	static VenueProfileResponse from(VenueProfileView v) {
		return new VenueProfileResponse(v.name(), v.beach(), v.region(), v.description(),
				v.bookingMode().name(), v.bookingCutoff().format(CUTOFF), v.commissionBps(),
				v.payoutCurrency(), v.amenities().stream().map(Amenity::name).toList(),
				v.distanceToWaterM());
	}
}
