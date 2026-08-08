package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;

/**
 * The read-side view of a stored variant — everything except the bytes. Returned by
 * {@link PhotoStorage#listMetadata} so the platform-admin moderation read can build the
 * content-addressed serving URL from the {@link ContentHash} without ever selecting the {@code bytea} column
 * (ADR-0008: keep the blob off the list/metadata path). The Discover cards, the beach-map banner and
 * the operator slots do <em>not</em> come through here — they run their own SQL in the JDBC adapters.
 */
public record VariantMeta(PhotoSurface surface, ContentHash hash, String contentType,
		int width, int height) {
}
