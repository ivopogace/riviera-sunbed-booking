package ai.riviera.platform.venue.vocabulary;

/**
 * The fixed platform amenity catalogue. A venue's amenities are an
 * order-insensitive subset of these; the venue read views carry them as codes.
 *
 * <p><strong>Declaration order IS the canonical display/priority order.</strong> The Discover
 * card renders the first N (currently 3) amenities a venue has in this order, and the beach-map
 * header renders all of them in this order — so the enum's natural ordering (ordinal) is the
 * single source of that order, sorted once in {@code JdbcVenueCatalog}. Keep it in lockstep with
 * the {@code venue_amenity_catalogue_check} constraint (V21) and the frontend mirror
 * ({@code shared/amenities.ts}); the wire value is the enum name, display labels are the
 * frontend's concern (like {@code BookingStatus} ↔ {@code booking-status.ts}).
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
