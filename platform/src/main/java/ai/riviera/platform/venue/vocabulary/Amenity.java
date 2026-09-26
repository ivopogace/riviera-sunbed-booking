package ai.riviera.platform.venue.vocabulary;

/**
 * The fixed platform amenity catalogue. A venue's amenities are an order-insensitive subset of
 * these; the venue read views carry them as codes (the enum name); labels are the frontend's.
 *
 * <p><strong>Declaration order IS the canonical display/priority order</strong> (the Discover card
 * shows the first N, the beach-map header all), sorted once in {@code JdbcVenueCatalog}. Keep it in
 * lockstep with the {@code venue_amenity_catalogue_check} constraint (V21) and the frontend mirror
 * ({@code shared/amenities.ts}).
 */
public enum Amenity {
	BEACH_BAR,
	RESTAURANT,
	CAFE,
	FREE_PARKING,
	SHOWERS,
	WIFI,
	WATER_SPORTS,
	PET_FRIENDLY,
	SNACK_SHACK,
	SNORKELLING,
	QUIET_BAY
}
