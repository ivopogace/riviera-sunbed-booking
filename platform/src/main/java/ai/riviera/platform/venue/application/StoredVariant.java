package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;

/**
 * One resized, EXIF-stripped, capped variant ready to persist — the write-side carrier produced by
 * {@code PhotoProcessor} and consumed by {@link PhotoStorage#replace}. Carries the bytes (never the
 * full-res original, ADR-0008) plus the metadata the serving path needs: the surface it renders,
 * its content hash (the immutable-URL cache key), MIME type, and pixel dimensions.
 */
public record StoredVariant(PhotoSurface surface, ContentHash hash, String contentType,
		int width, int height, byte[] bytes) {
}
