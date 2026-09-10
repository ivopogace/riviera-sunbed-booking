package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;
import java.util.List;

/**
 * One venue as the tourist discovery list needs it (design §4.1 steps 1–2). The
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
 * optional distance to the water in metres, or {@code null} when not stated.
 *
 * <p>{@code coverPhoto} is the cover slot's card + banner {@link PhotoView}s, or {@code null}
 * when no cover photo is uploaded — the card then renders its gradient fallback.
 *
 * <p>{@code photos} is the Discover card's slideshow: one card-sized {@link PhotoView} per occupied
 * photo slot, in {@link PhotoSlot} order (cover, sunbeds, bar), possibly empty. Each carries every
 * stored density so the browser picks per rendered box. Uploads predating the secondary slots' CARD
 * variant serve their PREVIEW variant instead, so a venue's slideshow never loses a photo to the
 * rollout.
 *
 * <p>{@code salesOpen} is whether online sales for the selected date are open right now —
 * booking's sales-window verdict (invariant #4), the on-day sales close and the season closure
 * together, computed per request; display only, the reserve path enforces the fence independently.
 *
 * <p>{@code closedForSeason} is whether the venue's season closure is in effect right now — the
 * "Closed for season" badge — and {@code reopensOn} its reopen day while it is, else {@code null}. A
 * closed venue stays listed, after every open one.
 */
public record VenueSummaryView(long id, String name, String beach, String region,
		int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, List<Amenity> amenities, Integer distanceToWaterM,
		AvailabilitySummary availability, CoverPhotoView coverPhoto, List<PhotoView> photos,
		boolean salesOpen, boolean closedForSeason, LocalDate reopensOn) {
}
