package ai.riviera.platform.venue.vocabulary;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * A venue's position on the riviera map, in WGS84 decimal degrees. Absence is a null
 * {@code VenueLocation}, never a half-filled pair, so both components are required. Mirrors
 * {@code venue_location_check} (V58, ADR-0018 §3); the CHECK stays the race-safe backstop.
 *
 * <p>Both coordinates are normalised to six decimal places (~0.11 m), the scale the columns store,
 * so a pin a write echoes equals the one a later read returns and {@code equals} is stable.
 * Rationale: RESPONSIBILITIES.md §venue.
 */
public record VenueLocation(BigDecimal latitude, BigDecimal longitude) {

	/** Decimal places stored, mirroring {@code NUMERIC(8,6)} / {@code NUMERIC(9,6)}. */
	private static final int STORED_SCALE = 6;
	private static final BigDecimal MIN_LATITUDE = new BigDecimal("-90");
	private static final BigDecimal MAX_LATITUDE = new BigDecimal("90");
	private static final BigDecimal MIN_LONGITUDE = new BigDecimal("-180");
	private static final BigDecimal MAX_LONGITUDE = new BigDecimal("180");

	public VenueLocation {
		latitude = normalised(latitude, "latitude");
		longitude = normalised(longitude, "longitude");
		requireWithin(latitude, MIN_LATITUDE, MAX_LATITUDE, "latitude");
		requireWithin(longitude, MIN_LONGITUDE, MAX_LONGITUDE, "longitude");
	}

	private static BigDecimal normalised(BigDecimal coordinate, String field) {
		if (coordinate == null) {
			throw new IllegalArgumentException(field + " is required when a location is given");
		}
		return coordinate.setScale(STORED_SCALE, RoundingMode.HALF_UP);
	}

	private static void requireWithin(BigDecimal coordinate, BigDecimal min, BigDecimal max, String field) {
		if (coordinate.compareTo(min) < 0 || coordinate.compareTo(max) > 0) {
			throw new IllegalArgumentException(field + " must be between " + min + " and " + max);
		}
	}
}
