package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;
import java.util.List;

/**
 * The venue + its beach map for the tourist read. Rating is ×10; beach/region are wire codes; {@code fromPrice} is the
 * cheapest ONLINE-pool set (#3, #5) as on {@link VenueSummaryView}. Nullable: {@code fromPrice}, distance, cover,
 * {@code reopensOn}, location, {@code maxStayDays} (any length). {@code setVersion} is the layout's own
 * optimistic-concurrency stamp (stale write → 409), date-independent. {@code lightboxPhotos} stays apart from
 * {@code photos} so a 2200px candidate never reaches the band (ADR-0008). {@code salesOpen} (#4) and
 * {@code salesClose} ({@code HH:mm} copy key, never compared with a clock) are display only.
 */
public record VenueMapView(long id, String name, String beach, String region,
		String description, int ratingTenths, int reviewsCount, String bookingMode,
		MoneyView fromPrice, List<Amenity> amenities, Integer distanceToWaterM,
		List<SetView> sets, long setVersion, CoverPhotoView coverPhoto, List<PhotoView> photos,
		List<PhotoView> lightboxPhotos, boolean salesOpen, String salesClose, boolean closedForSeason,
		LocalDate reopensOn, VenueLocation location, Integer maxStayDays) {
}
