package ai.riviera.platform.itinerary.domain;

/**
 * Whether a venue can host a stay, and the two facts a tourist is told when it cannot:
 * {@code longestRunDays}, the most consecutive days of the stay one online set is free for
 * ({@code 0} with no online set), and {@code maxStayDays}, the venue's maximum stay or {@code null}
 * for any length. {@code sameSetCount} is how many online sets are free on every day.
 */
public record StayVerdict(Fit fit, int sameSetCount, int longestRunDays, Integer maxStayDays) {

	public enum Fit {
		/** At least one online set is free for every day, within the venue's maximum stay. */
		SAME_SET,
		/** No online set covers the stay, or it is longer than the venue's maximum. */
		CANNOT_HOST
	}
}
