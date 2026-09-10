package ai.riviera.platform.venue.application;

import java.util.Arrays;
import java.util.Objects;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;

/**
 * One resized, EXIF-stripped, capped variant ready to persist — the write-side carrier produced by
 * {@code PhotoProcessor} and consumed by {@link PhotoStorage#replace}. Carries the bytes (never the
 * full-res original, ADR-0008) plus the metadata the serving path needs: the surface it renders, its
 * density {@code scale}, its content hash (the immutable-URL cache key), MIME type, and pixel
 * dimensions.
 *
 * <p>{@code (surface, scale)} is the identity of a rendition within one photo, and matches the
 * {@code UNIQUE (photo_id, surface, scale)} constraint. Scale 1 is the baseline every surface
 * carries; scale 2 is the retina tier, present only for the tourist surfaces and only when the
 * source was large enough to render it without upscaling.
 */
public record StoredVariant(PhotoSurface surface, int scale, ContentHash hash, String contentType,
		int width, int height, byte[] bytes) {

	@Override
	public boolean equals(Object other) {
		// Content comparison for the array (java:S6218) — the record default would be identity.
		return other instanceof StoredVariant(var s, var sc, var h, var t, var w, var ht, var b)
				&& surface == s && scale == sc && hash.equals(h) && contentType.equals(t)
				&& width == w && height == ht && Arrays.equals(bytes, b);
	}

	@Override
	public int hashCode() {
		return Objects.hash(surface, scale, hash, contentType, width, height, Arrays.hashCode(bytes));
	}

	@Override
	public String toString() {
		return "StoredVariant[surface=" + surface + "@" + scale + ", hash=" + hash
				+ ", contentType=" + contentType + ", width=" + width + ", height=" + height
				+ ", bytes=" + bytes.length + "B]";
	}
}
