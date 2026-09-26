package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;
import java.util.List;

/**
 * One venue as the tourist discovery card needs it, no per-set layout ({@link VenueMapView} has that).
 * {@code ratingTenths} is rating ×10, never a float; {@code beach}/{@code region} are wire codes; {@code fromPrice}
 * is the cheapest set in minor units (#5), {@code null} with no sets. {@code availability} is the day's free/total
 * off the same {@code (set, date)} rows as the map (#2). {@code photos} are card-sized per occupied slot, falling
 * back to PREVIEW (ADR-0008). {@code salesOpen} (#4) is display only. Closed-for-season and unpinned ({@code null}
 * {@code location}) venues stay listed. Also nullable: distance, cover, {@code reopensOn}.
 */
public record VenueSummaryView(long id, String name, String beach, String region,
		int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, List<Amenity> amenities, Integer distanceToWaterM,
		AvailabilitySummary availability, CoverPhotoView coverPhoto, List<PhotoView> photos,
		boolean salesOpen, boolean closedForSeason, LocalDate reopensOn, VenueLocation location) {
}
