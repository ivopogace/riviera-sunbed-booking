package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * What a stay verdict needs from the map: the venue's active {@link Pool#ONLINE} sets in id order
 * (invariant #3) and its maximum stay in days, {@code null} for any length this season.
 */
public record VenueStayFacts(List<SetId> onlineSets, Integer maxStayDays) {
}
