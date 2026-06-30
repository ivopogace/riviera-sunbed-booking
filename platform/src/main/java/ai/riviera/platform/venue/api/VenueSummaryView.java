package ai.riviera.platform.venue.api;

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
 */
public record VenueSummaryView(long id, String name, String beach, String region,
		int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, AvailabilitySummary availability) {
}
