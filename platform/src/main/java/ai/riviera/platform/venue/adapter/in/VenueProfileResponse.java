package ai.riviera.platform.venue.adapter.in;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import ai.riviera.platform.venue.application.PhotoSlotView;
import ai.riviera.platform.venue.application.VenueProfileView;
import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.Amenity;
import ai.riviera.platform.venue.vocabulary.VenueLocation;

/**
 * The owner's {@code GET /api/venues/{venueId}/profile}, in the console form's shape (tokens as
 * strings, times as {@code "HH:mm"}) so it round-trips to the profile {@code PATCH}; {@code version}
 * returns as {@code expectedVersion}, a stale one 409. Display-only here: {@code commissionBps} and
 * {@code payoutCurrency} (admin-written) and {@code seasonClosure} (its own endpoint).
 * {@code photos} always keys all three lower-case slots to a PREVIEW URL, {@code null} when empty.
 * A {@code null} {@code location} is no pin; a {@code null} {@code maxStayDays} is any length.
 */
record VenueProfileResponse(String name, String beach, String description,
		String bookingMode, String bookingCutoff, String salesClose, int commissionBps,
		String payoutCurrency, List<String> amenities, Integer distanceToWaterM, long version,
		Map<String, SlotPhoto> photos, SeasonClosureView seasonClosure, VenueLocation location,
		Integer maxStayDays) {

	record SlotPhoto(String previewUrl) {
	}

	static VenueProfileResponse from(VenueProfileView v) {
		Map<String, SlotPhoto> photos = new LinkedHashMap<>(); // slot declaration order, stable on the wire
		for (PhotoSlotView slot : v.photos()) {
			photos.put(slot.slot().name().toLowerCase(Locale.ROOT), new SlotPhoto(slot.previewUrl()));
		}
		return new VenueProfileResponse(v.name(), v.beach(), v.description(),
				v.bookingMode().name(), v.bookingCutoff().format(SalesClose.WIRE),
				v.salesClose().format(SalesClose.WIRE),
				v.commissionBps(), v.payoutCurrency(), v.amenities().stream().map(Amenity::name).toList(),
				v.distanceToWaterM(), v.version(), photos,
				SeasonClosureView.of(v.seasonClosure(), v.closedForSeason()), v.location(),
				v.maxStayDays());
	}
}
