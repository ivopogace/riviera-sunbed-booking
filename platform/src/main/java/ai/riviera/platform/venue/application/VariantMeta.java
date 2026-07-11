package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;

/**
 * The read-side view of a stored variant — everything except the bytes. Returned by
 * {@link PhotoStorage#listMetadata} so read models (Discover cards, the beach-map banner, the
 * operator slots) can build the immutable serving URL from the {@link ContentHash} without ever
 * selecting the {@code bytea} column (ADR-0008: keep the blob off the list/metadata path).
 */
public record VariantMeta(PhotoSurface surface, ContentHash hash, String contentType,
		int width, int height) {
}
