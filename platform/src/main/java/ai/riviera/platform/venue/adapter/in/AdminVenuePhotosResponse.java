package ai.riviera.platform.venue.adapter.in;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import ai.riviera.platform.venue.application.PhotoSlotView;

/**
 * The wire response for {@code GET /api/admin/venues/{venueId}/photos} (#511) — what the admin
 * console's Photos tab needs to show a venue's slots before taking one down.
 *
 * <p><strong>Deliberately the same {@code photos} shape as {@link VenueProfileResponse}</strong>:
 * every slot keyed lower-case (matching the REST path vocabulary), its PREVIEW serving URL, and
 * {@code null} when the slot is empty — always all three keys, so a client renders a stable grid and
 * emptiness needs no separate boolean (#142 review F-11). Two reads of the same data under two
 * different authorities should not speak two vocabularies; only the authority differs.
 *
 * <p>{@code venueId} is echoed back because this surface's client picks a venue from a list and then
 * fetches it, so a response that cannot be matched to its request would have to be tracked
 * out-of-band. It carries no venue name, rating or ownership: the moderation decision is about the
 * photo, and the console already has the name from the picker it just used.
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
