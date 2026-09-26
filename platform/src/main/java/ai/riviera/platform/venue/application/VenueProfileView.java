package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.List;

import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.VenueLocation;

/**
 * The owner's venue profile for the console form, returned by {@link ViewVenueProfile} after the owner
 * check (invariant #13). Carries {@code commissionBps} and {@code payoutCurrency}, read-only here and never
 * to reach the anonymous tourist read. {@code version} is the optimistic-concurrency token the profile
 * {@code PATCH} echoes (stale → 409). {@code photos} is always all three slots ({@code null} URL = empty).
 * The tab keys on the {@code closedForSeason} verdict, never the stored {@code seasonClosure} (written via
 * {@code CloseForSeason}). Nullable: {@code location}, {@code maxStayDays} (any length).
 */
public record VenueProfileView(String name, String beach, String description,
		BookingMode bookingMode, LocalTime bookingCutoff, LocalTime salesClose, int commissionBps,
		String payoutCurrency, List<Amenity> amenities, Integer distanceToWaterM, long version,
		List<PhotoSlotView> photos, SeasonClosure seasonClosure, boolean closedForSeason,
		VenueLocation location, Integer maxStayDays) {
}
