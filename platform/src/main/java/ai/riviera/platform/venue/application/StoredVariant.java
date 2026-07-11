package ai.riviera.platform.venue.application;

import java.util.Arrays;
import java.util.Objects;

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

	@Override
	public boolean equals(Object other) {
		// Content comparison for the array (java:S6218) — the record default would be identity.
		return other instanceof StoredVariant(var s, var h, var t, var w, var ht, var b)
				&& surface == s && hash.equals(h) && contentType.equals(t)
				&& width == w && height == ht && Arrays.equals(bytes, b);
	}

	@Override
	public int hashCode() {
		return Objects.hash(surface, hash, contentType, width, height, Arrays.hashCode(bytes));
	}

	@Override
	public String toString() {
		return "StoredVariant[surface=" + surface + ", hash=" + hash + ", contentType=" + contentType
				+ ", width=" + width + ", height=" + height + ", bytes=" + bytes.length + "B]";
	}
}
