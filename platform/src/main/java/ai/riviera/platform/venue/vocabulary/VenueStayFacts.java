package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * What a stay verdict needs from the map: the venue's active {@link Pool#ONLINE} sets in id order
 * (invariant #3), its maximum stay in days ({@code null} for any length this season) and its
 * booking mode, which decides whether a stitched plan may be offered at all.
 */
public record VenueStayFacts(List<SetId> onlineSets, Integer maxStayDays, BookingMode bookingMode) {
}
