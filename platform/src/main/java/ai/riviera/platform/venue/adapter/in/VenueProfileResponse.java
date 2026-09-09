package ai.riviera.platform.venue.adapter.in;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import ai.riviera.platform.venue.application.PhotoSlotView;
import ai.riviera.platform.venue.application.VenueProfileView;
import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.Amenity;

/**
 * The wire response for {@code GET /api/venues/{venueId}/profile}: the owner's venue-admin
 * profile, mapped from the application {@link VenueProfileView} to the shape the console form
 * consumes — booking mode + amenity codes as their token strings, the cutoff and the sales close as
 * {@code "HH:mm"} — so the round-trip to the profile {@code PATCH} is symmetric.
 *
 * <p>{@code commissionBps} and {@code payoutCurrency} are display-only on this surface: a venue does
 * not set its own commission, and the {@code PATCH} cannot reach the column (the platform admin
 * writes it through {@code PUT /api/admin/venues/{venueId}/commission}).
 *
 * <p>{@code version} is the row's optimistic-concurrency token: the tab echoes it back as
 * {@code expectedVersion} on the next {@code PATCH}, so a stale write is rejected with 409.
 *
 * <p>{@code photos} keys every slot (lower-case, matching the REST path vocabulary) to its
 * PREVIEW serving URL, {@code null} when empty — always all three keys, so the tab renders
 * a stable grid. Emptiness is the null URL; no separate boolean.
 *
 * <p>{@code seasonClosure} is read-only here too: it is written through
 * {@code PUT}/{@code DELETE …/season-closure}, never the {@code PATCH}.
 */
record VenueProfileResponse(String name, String beach, String region, String description,
		String bookingMode, String bookingCutoff, String salesClose, int commissionBps,
		String payoutCurrency, List<String> amenities, Integer distanceToWaterM, long version,
		Map<String, SlotPhoto> photos, SeasonClosureView seasonClosure) {

	record SlotPhoto(String previewUrl) {
	}

	static VenueProfileResponse from(VenueProfileView v) {
		Map<String, SlotPhoto> photos = new LinkedHashMap<>(); // slot declaration order, stable on the wire
		for (PhotoSlotView slot : v.photos()) {
			photos.put(slot.slot().name().toLowerCase(Locale.ROOT), new SlotPhoto(slot.previewUrl()));
		}
		return new VenueProfileResponse(v.name(), v.beach(), v.region(), v.description(),
				v.bookingMode().name(), v.bookingCutoff().format(SalesClose.WIRE),
				v.salesClose().format(SalesClose.WIRE),
				v.commissionBps(), v.payoutCurrency(), v.amenities().stream().map(Amenity::name).toList(),
				v.distanceToWaterM(), v.version(), photos,
				SeasonClosureView.of(v.seasonClosure(), v.closedForSeason()));
	}
}
