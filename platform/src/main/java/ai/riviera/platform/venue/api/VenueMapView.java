package ai.riviera.platform.venue.api;

import java.util.List;

/**
 * The venue + its beach map, as the tourist read screen needs it (U1). {@code ratingTenths}
 * is the display rating ×10 (e.g. 48 → 4.8) — an integer, never a float. {@code fromPrice}
 * is the cheapest set's price across the map. {@code sets} are ordered for rendering.
 */
public record VenueMapView(long id, String name, String beach, String region,
		String description, int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, List<SetView> sets) {
}
