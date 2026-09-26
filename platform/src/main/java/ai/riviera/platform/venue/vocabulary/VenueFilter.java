package ai.riviera.platform.venue.vocabulary;

/**
 * The optional discovery filters a tourist narrows the venue list by: a {@link Beach} code and/or
 * a {@link Beach.Region} code, as wire strings. A {@code null} dimension means "no constraint"
 * (both null lists every venue); a code off the catalogue matches nothing; non-null dimensions
 * AND-combine.
 *
 * <p>Construct via {@link #of(String, String)}, which normalises blank input to {@code null} so an
 * empty query param ({@code ?beach=}) means "unfiltered", not "match the empty string".
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
