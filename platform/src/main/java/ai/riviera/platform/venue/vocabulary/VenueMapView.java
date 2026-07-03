package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * The venue + its beach map, as the tourist read screen needs it (U1). {@code ratingTenths}
 * is the display rating ×10 (e.g. 48 → 4.8) — an integer, never a float. {@code fromPrice}
 * is the cheapest set's price across the map. {@code sets} are ordered for rendering.
 *
 * <p>{@code amenities} are this venue's amenities in canonical catalogue order ({@link Amenity}),
 * possibly empty; the beach-map header renders the full row. {@code distanceToWaterM} is the
 * optional distance to the water in metres, or {@code null} when not stated (T7, issue #140).
 */
public record VenueMapView(long id, String name, String beach, String region,
		String description, int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, List<Amenity> amenities, Integer distanceToWaterM,
		List<SetView> sets) {
}
