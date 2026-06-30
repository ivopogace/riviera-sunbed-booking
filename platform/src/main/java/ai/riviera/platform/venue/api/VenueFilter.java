package ai.riviera.platform.venue.api;

/**
 * The optional discovery filters a tourist narrows the venue list by (issue #61): an exact-match
 * {@code beach} and/or {@code region}. A {@code null} dimension means "no constraint" — both null
 * lists every venue. Filters are AND-combined (a venue must match every non-null dimension).
 *
 * <p>Construct via {@link #of(String, String)}, which normalises blank/whitespace input to
 * {@code null} so an empty query param ({@code ?beach=}) is treated as "unfiltered", not "match
 * the empty string".
 */
public record VenueFilter(String beach, String region) {

	/** A filter with blank or whitespace-only dimensions normalised to {@code null} (no constraint). */
	public static VenueFilter of(String beach, String region) {
		return new VenueFilter(blankToNull(beach), blankToNull(region));
	}

	private static String blankToNull(String value) {
		return (value == null || value.isBlank()) ? null : value;
	}
}
