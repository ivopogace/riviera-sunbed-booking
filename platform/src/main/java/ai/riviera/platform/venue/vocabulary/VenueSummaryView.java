package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * One venue as the tourist discovery list needs it (issue #61, design §4.1 steps 1–2). The
 * coarse, list-level view: enough to render a card and decide whether to open the full beach
 * map ({@link VenueMapView}), no per-set layout.
 *
 * <p>{@code ratingTenths} is the display rating ×10 (e.g. 48 → 4.8) — an integer, never a float.
 * {@code fromPrice} is the cheapest set's price across the venue (integer minor units, invariant
 * #5), or {@code null} when the venue has no sets yet. {@code availability} is that day's
 * free/total set count, sourced per-{@code (set, date)} from the authoritative availability table
 * (invariant #2) — the same source of truth the single-venue map reads.
 *
 * <p>{@code amenities} are this venue's amenities in canonical catalogue order ({@link Amenity}),
 * possibly empty — the Discover card renders the first few. {@code distanceToWaterM} is the
 * optional distance to the water in metres, or {@code null} when not stated (T7, issue #140).
 *
 * <p>{@code coverPhoto} is the cover slot's card + banner serving URLs (#142), or {@code null}
 * when no cover photo is uploaded — the card then renders its gradient fallback.
 */
public record VenueSummaryView(long id, String name, String beach, String region,
		int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, List<Amenity> amenities, Integer distanceToWaterM,
		AvailabilitySummary availability, CoverPhotoView coverPhoto) {
}
