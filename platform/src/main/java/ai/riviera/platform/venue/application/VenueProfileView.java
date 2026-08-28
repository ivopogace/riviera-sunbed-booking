package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.List;

import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.BookingMode;

/**
 * The operator's own view of a venue's admin profile — everything the console's
 * Venue &amp; commodities tab needs to render its form: the editable core
 * (name/beach/region/description, booking mode, booking cutoff, amenities, distance-to-water) plus
 * the two <strong>read-only</strong> display fields, {@code commissionBps} (shown as a %; the
 * platform's cut, invariant #9) and {@code payoutCurrency} (standing provisional). Returned by the
 * {@link ViewVenueProfile} driving port after the owner check (invariant #13).
 *
 * <p>This is deliberately NOT the public tourist {@code VenueMapView}: it carries commission +
 * payout currency, which must never reach the anonymous read (that is why the read endpoint is
 * gated to the owning operator, not permitted like {@code GET /api/venues/*}).
 *
 * <p>{@code version} is the row's optimistic-concurrency token: the tab loads it here and
 * echoes it back on the next profile {@code PATCH}, so a stale write is rejected with 409 rather
 * than clobbering {@code bookingMode}/{@code bookingCutoff}. Read-only for the operator — the write
 * never sets it directly; the conditional {@code UPDATE} bumps it.
 *
 * <p>{@code photos} carries every {@code PhotoSlot} in declaration order with its preview URL
 * ({@code null} = empty slot) — always all three slots, so the tab renders a stable grid.
 *
 * <p>{@code salesClose} is read-only display this slice — the per-venue on-day sales-close
 * time; no PATCH field sets it (a later slice adds that).
 */
public record VenueProfileView(String name, String beach, String region, String description,
		BookingMode bookingMode, LocalTime bookingCutoff, LocalTime salesClose, int commissionBps,
		String payoutCurrency, List<Amenity> amenities, Integer distanceToWaterM, long version,
		List<PhotoSlotView> photos) {
}
