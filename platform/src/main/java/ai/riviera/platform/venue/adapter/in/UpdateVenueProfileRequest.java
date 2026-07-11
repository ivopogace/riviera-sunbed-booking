package ai.riviera.platform.venue.adapter.in;

import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.application.VenueProfileCommand;

/**
 * The request body for editing a venue's profile ({@code PATCH /api/venues/{venueId}}, widened by
 * O8 #177 from the T7 #140 amenities + distance). It carries the operator-editable fields —
 * {@code name}/{@code beach}/{@code region}/{@code description}, {@code bookingMode}
 * ({@code INSTANT}|{@code REQUEST}), {@code bookingCutoff} ({@code "HH:mm"} in {@code Europe/Tirane}),
 * the full amenity set (codes from the fixed {@link Amenity} catalogue), and the optional
 * distance-to-water in metres. <strong>Commission and payout currency are read-only and absent</strong>
 * — the write cannot touch them.
 *
 * <p>{@link #toCommand()} parses each amenity code to {@link Amenity} and the cutoff to a
 * {@link LocalTime}; a bad/null amenity code or a malformed time is an {@link IllegalArgumentException}
 * → {@code 400 INVALID_REQUEST} (the one error contract, §6b). The remaining edge invariants
 * (required text, known mode, positive distance) are delegated to {@link VenueProfileCommand}.
 *
 * <p><strong>The edit REPLACES the profile</strong> (the form always re-sends every field), so a
 * null/absent {@code amenities} clears them and a null {@code distanceToWaterM} clears the distance.
 *
 * <p>{@code expectedVersion} is the required optimistic-concurrency token (#224) — the {@code version}
 * the tab loaded with the profile. It is typed {@link Long} (not primitive) so an absent field is
 * {@code null}, not a silent {@code 0}: {@link #requiredExpectedVersion()} rejects the null with a
 * {@code 400} rather than letting it match a fresh venue and re-open the last-write-wins hole.
 */
record UpdateVenueProfileRequest(String name, String beach, String region, String description,
		String bookingMode, String bookingCutoff, List<String> amenities, Integer distanceToWaterM,
		Long expectedVersion) {

	/** The loaded concurrency token, required — a missing {@code expectedVersion} is a 400, never a 0 (#224). */
	long requiredExpectedVersion() {
		if (expectedVersion == null) {
			throw new IllegalArgumentException("expectedVersion is required");
		}
		return expectedVersion;
	}

	VenueProfileCommand toCommand() {
		Set<Amenity> parsed = (amenities == null ? List.<String>of() : amenities).stream()
				.map(UpdateVenueProfileRequest::parseCode)
				.collect(Collectors.toUnmodifiableSet());
		return new VenueProfileCommand(name, beach, region, description, bookingMode,
				parseCutoff(bookingCutoff), parsed, distanceToWaterM);
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
}
