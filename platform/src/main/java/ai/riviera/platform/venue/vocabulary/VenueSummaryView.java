package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;
import java.util.List;

/**
 * One venue as the tourist discovery card needs it, no per-set layout ({@link VenueMapView} has that). Rating is
 * ×10; beach/region are wire codes. {@code fromPrice} is the cheapest ONLINE-pool set (#3, #5), {@code null} with
 * none; {@code availability} is the day's free/total over both pools (#2); {@code sellsOnline}: any ONLINE set.
 * {@code photos} are card-sized per slot, else PREVIEW (ADR-0008). {@code salesOpen} (#4) is display only. Season-closed
 * and unpinned ({@code null} {@code location}) venues stay listed. Also nullable: distance, cover, {@code reopensOn}.
 */
public record VenueSummaryView(long id, String name, String beach, String region,
		int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, List<Amenity> amenities, Integer distanceToWaterM,
		AvailabilitySummary availability, boolean sellsOnline, CoverPhotoView coverPhoto, List<PhotoView> photos,
		boolean salesOpen, boolean closedForSeason, LocalDate reopensOn, VenueLocation location) {
}
