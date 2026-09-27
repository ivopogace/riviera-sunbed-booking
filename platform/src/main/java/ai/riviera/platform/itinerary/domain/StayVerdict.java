package ai.riviera.platform.itinerary.domain;

/**
 * Whether a venue can host a stay, and the facts a tourist is told: {@code sameSetCount} online sets
 * free on every day; {@code moves} the fewest moves of a plan within the budget (only for
 * {@link Fit#FITS_WITH_MOVES}, else {@code 0}); {@code longestRunDays}, the most consecutive days of
 * the stay one online set is free for ({@code 0} with no online set); and {@code maxStayDays}, the
 * venue's maximum stay or {@code null} for any length.
 */
public record StayVerdict(Fit fit, int sameSetCount, int longestRunDays, Integer maxStayDays, int moves) {

	public enum Fit {
		/** At least one online set is free for every day, within the venue's maximum stay. */
		SAME_SET,
		/** No single set covers the stay, but a plan of same-set stretches within the move budget does (D13). */
		FITS_WITH_MOVES,
		/** No plan within the budget covers the stay, or it is longer than the venue's maximum. */
		CANNOT_HOST
	}
}
