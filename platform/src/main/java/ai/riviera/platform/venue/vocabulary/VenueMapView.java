package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * The venue + its beach map, as the tourist read screen needs it (U1). {@code ratingTenths}
 * is the display rating ×10 (e.g. 48 → 4.8) — an integer, never a float. {@code fromPrice}
 * is the cheapest set's price across the map. {@code sets} are ordered for rendering.
 *
 * <p>{@code amenities} are this venue's amenities in canonical catalogue order ({@link Amenity}),
 * possibly empty; the beach-map header renders the full row. {@code distanceToWaterM} is the
 * optional distance to the water in metres, or {@code null} when not stated.
 *
 * <p>{@code setVersion} is the layout's optimistic-concurrency stamp: the {@code venue.set_version}
 * counter the operator's layout + pricing tabs load here and echo back on the next beach-map replace /
 * per-row reprice, so a stale write is rejected with 409 rather than clobbering another writer's layout
 * or prices. It is <strong>date-independent</strong> (a property of the static map, not the availability
 * overlay) and separate from the profile {@code version}; tourists ignore it.
 *
 * <p>{@code coverPhoto} is the cover slot's card + banner serving URLs, or {@code null}
 * when no cover photo is uploaded — the map banner then renders its gradient fallback.
 *
 * <p>{@code photos} is the banner band's slideshow: one banner-sized serving URL per occupied
 * photo slot, in {@link PhotoSlot} order (cover, sunbeds, bar), possibly empty. Uploads predating
 * the uniform per-slot surfaces serve their best available variant (CARD, then PREVIEW) instead,
 * so a venue's slideshow never loses a photo to the rollout.
 */
public record VenueMapView(long id, String name, String beach, String region,
		String description, int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, List<Amenity> amenities, Integer distanceToWaterM,
		List<SetView> sets, long setVersion, CoverPhotoView coverPhoto, List<String> photos) {
}
