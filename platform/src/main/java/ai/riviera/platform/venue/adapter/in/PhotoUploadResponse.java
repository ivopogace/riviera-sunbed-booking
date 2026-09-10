package ai.riviera.platform.venue.adapter.in;

import java.util.List;
import java.util.Locale;

import ai.riviera.platform.venue.application.PhotoMetadata;
import ai.riviera.platform.venue.application.PhotoServingUrls;

/**
 * Wire response for a successful photo upload: the slot plus each stored rendition's serving URL
 * and dimensions, so the operator UI can show the new preview immediately without a re-fetch. URLs are
 * the content-addressed serving path (ADR-0008; revalidated rather than {@code immutable}).
 * Slot / surface are rendered lower-case to match the REST + frontend vocabulary.
 *
 * <p>A rendition is identified by {@code surface} AND {@code scale}: a tourist surface appears once
 * per stored density, so {@code surface} alone does not key this list.
 */
record PhotoUploadResponse(String slot, List<Variant> variants) {

	record Variant(String surface, int scale, String url, int width, int height) {
	}

	static PhotoUploadResponse from(long venueId, PhotoMetadata metadata) {
		List<Variant> variants = metadata.variants().stream()
				.map(v -> new Variant(
						v.surface().name().toLowerCase(Locale.ROOT),
						v.scale(),
						PhotoServingUrls.servingUrl(venueId, v.hash()),
						v.width(),
						v.height()))
				.toList();
		return new PhotoUploadResponse(metadata.slot().name().toLowerCase(Locale.ROOT), variants);
	}
}
