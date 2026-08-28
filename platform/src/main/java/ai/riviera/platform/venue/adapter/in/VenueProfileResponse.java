package ai.riviera.platform.venue.adapter.in;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import ai.riviera.platform.venue.application.PhotoSlotView;
import ai.riviera.platform.venue.application.VenueProfileView;
import ai.riviera.platform.venue.vocabulary.Amenity;

/**
 * The wire response for {@code GET /api/venues/{venueId}/profile}: the owner's
 * venue-admin profile. Maps the application {@link VenueProfileView} to the shape the console form
 * consumes — booking mode + amenity codes as their token strings, and the cutoff as {@code "HH:mm"}
 * (matching {@code CreateVenueRequest.bookingCutoff}), so the round-trip to the widened
 * {@code PATCH} is symmetric.
 *
 * <p>{@code commissionBps} and {@code payoutCurrency} are <strong>display-only on this surface</strong>
 * — for the operator, deliberately (O8 #177): a venue does not set its own commission. Since A7 (#348)
 * the rate <em>is</em> changeable, by the platform admin through
 * {@code PUT /api/admin/venues/{venueId}/commission}; the {@code PATCH} here is unchanged and still
 * cannot reach the column.
 *
 * <p>{@code version} is the row's optimistic-concurrency token: the tab echoes it back as
 * {@code expectedVersion} on the next {@code PATCH}, so a stale write is rejected with 409.
 *
 * <p>{@code photos} keys every slot (lower-case, matching the REST path vocabulary) to its
 * PREVIEW serving URL, {@code null} when empty — always all three keys, so the tab renders
 * a stable grid. Emptiness is the null URL; no separate boolean.
 *
 * <p>{@code salesClose} is display-only, like commission — no PATCH field reaches it.
 */
record VenueProfileResponse(String name, String beach, String region, String description,
		String bookingMode, String bookingCutoff, String salesClose, int commissionBps,
		String payoutCurrency, List<String> amenities, Integer distanceToWaterM, long version,
		Map<String, SlotPhoto> photos) {

	record SlotPhoto(String previewUrl) {
	}

	/** {@code "HH:mm"} to match the write DTO's cutoff shape (drops the always-zero seconds of a TIME). */
	private static final DateTimeFormatter CUTOFF = DateTimeFormatter.ofPattern("HH:mm");

	static VenueProfileResponse from(VenueProfileView v) {
		Map<String, SlotPhoto> photos = new LinkedHashMap<>(); // slot declaration order, stable on the wire
		for (PhotoSlotView slot : v.photos()) {
			photos.put(slot.slot().name().toLowerCase(Locale.ROOT), new SlotPhoto(slot.previewUrl()));
		}
		return new VenueProfileResponse(v.name(), v.beach(), v.region(), v.description(),
				v.bookingMode().name(), v.bookingCutoff().format(CUTOFF), v.salesClose().format(CUTOFF),
				v.commissionBps(), v.payoutCurrency(), v.amenities().stream().map(Amenity::name).toList(),
				v.distanceToWaterM(), v.version(), photos);
	}
}
