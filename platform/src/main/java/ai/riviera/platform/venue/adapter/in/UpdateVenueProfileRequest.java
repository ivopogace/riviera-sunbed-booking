package ai.riviera.platform.venue.adapter.in;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.VenueLocation;
import ai.riviera.platform.venue.application.VenueProfileCommand;

/**
 * The body of {@code PATCH /api/venues/{venueId}}, which REPLACES the profile: a null or absent
 * {@code amenities}, {@code distanceToWaterM}, {@code location} or {@code maxStayDays} clears it;
 * commission and payout currency are absent. {@code bookingCutoff} is {@code "HH:mm"} in
 * {@code Europe/Tirane}; {@code salesClose} is required: 00:01, 16:00 or 23:59. {@link #toCommand()}
 * throws IAE on bad input, for the caller to wrap as a 400. {@code expectedVersion} stays a boxed
 * {@link Long}, so an absent token is a 400, never a silent 0.
 */
record UpdateVenueProfileRequest(String name, String beach, String description,
		String bookingMode, String bookingCutoff, String salesClose, List<String> amenities,
		Integer distanceToWaterM, LocationBody location, Long expectedVersion, Integer maxStayDays) {

	/**
	 * The raw coordinate pair off the wire. Unvalidated by design: {@link VenueLocation} owns the
	 * bounds, so a half-present or out-of-range pair fails in one place for every caller.
	 */
	record LocationBody(BigDecimal latitude, BigDecimal longitude) {
	}

	VenueProfileCommand toCommand() {
		Set<Amenity> parsed = (amenities == null ? List.<String>of() : amenities).stream()
				.map(UpdateVenueProfileRequest::parseCode)
				.collect(Collectors.toUnmodifiableSet());
		return new VenueProfileCommand(name, BeachCode.parse(beach), description, bookingMode,
				parseCutoff(bookingCutoff), parseSalesClose(salesClose), parsed, distanceToWaterM,
				parseLocation(location), maxStayDays);
	}

	private static VenueLocation parseLocation(LocationBody body) {
		return body == null ? null : new VenueLocation(body.latitude(), body.longitude());
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

	private static LocalTime parseCutoff(String raw) {
		if (raw == null) {
			throw new IllegalArgumentException("bookingCutoff is required");
		}
		try {
			return LocalTime.parse(raw); // ISO-8601 local time, e.g. "18:00"
		}
		catch (DateTimeParseException malformed) {
			throw new IllegalArgumentException("bookingCutoff must be a valid time of day (HH:mm)");
		}
	}

	private static SalesClose parseSalesClose(String raw) {
		if (raw == null) {
			throw new IllegalArgumentException("salesClose is required");
		}
		try {
			return SalesClose.fromTime(LocalTime.parse(raw));
		}
		catch (DateTimeParseException malformed) {
			// Same message as fromTime's: the caller learns the vocabulary, not the parse mechanics.
			throw new IllegalArgumentException("salesClose must be one of 00:01, 16:00, 23:59");
		}
	}
}
