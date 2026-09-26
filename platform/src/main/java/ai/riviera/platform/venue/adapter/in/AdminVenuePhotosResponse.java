package ai.riviera.platform.venue.adapter.in;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import ai.riviera.platform.venue.application.PhotoSlotView;

/**
 * The wire response for {@code GET /api/admin/venues/{venueId}/photos} — the admin console's Photos
 * tab view of a venue's slots before a takedown. The same {@code photos} shape as
 * {@link VenueProfileResponse} (one vocabulary, two authorities): every slot keyed lower-case, its
 * PREVIEW URL, {@code null} when empty — always all three keys, so the grid is stable.
 * {@code venueId} is echoed so a response matches its request; no name, rating or ownership travels
 * (the moderation decision is about the photo).
 */
record AdminVenuePhotosResponse(long venueId, Map<String, SlotPhoto> photos) {

	record SlotPhoto(String previewUrl) {
	}

	static AdminVenuePhotosResponse from(long venueId, List<PhotoSlotView> slots) {
		Map<String, SlotPhoto> photos = new LinkedHashMap<>(); // slot declaration order, stable on the wire
		for (PhotoSlotView slot : slots) {
			photos.put(slot.slot().name().toLowerCase(Locale.ROOT), new SlotPhoto(slot.previewUrl()));
		}
		return new AdminVenuePhotosResponse(venueId, photos);
	}
}
