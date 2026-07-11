package ai.riviera.platform.venue.adapter.in;

import java.util.List;
import java.util.Locale;

import ai.riviera.platform.venue.application.PhotoMetadata;

/**
 * Wire response for a successful photo upload (#142): the slot plus each stored variant's serving URL
 * and dimensions, so the operator UI can show the new preview immediately without a re-fetch. URLs are
 * the content-addressed serving path (immutable per ADR-0008). Slot / surface are rendered lower-case
 * to match the REST + frontend vocabulary.
 */
record PhotoUploadResponse(String slot, List<Variant> variants) {

	record Variant(String surface, String url, int width, int height) {
	}

	static PhotoUploadResponse from(long venueId, PhotoMetadata metadata) {
		List<Variant> variants = metadata.variants().stream()
				.map(v -> new Variant(
						v.surface().name().toLowerCase(Locale.ROOT),
						"/api/venues/" + venueId + "/photos/" + v.hash().value(),
						v.width(),
						v.height()))
				.toList();
		return new PhotoUploadResponse(metadata.slot().name().toLowerCase(Locale.ROOT), variants);
	}
}
