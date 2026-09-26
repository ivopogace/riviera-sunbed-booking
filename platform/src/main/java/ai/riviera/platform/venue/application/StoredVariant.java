package ai.riviera.platform.venue.application;

import java.util.Arrays;
import java.util.Objects;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;

/**
 * One resized, EXIF-stripped variant ready to persist, from {@code PhotoProcessor} to
 * {@link PhotoStorage#replace}: the bytes (never the full-res original, ADR-0008) plus what serving
 * needs — surface, density {@code scale}, content hash (the immutable-URL cache key), MIME type and
 * pixel size. {@code (surface, scale)} is its identity within a photo, as the {@code UNIQUE} says;
 * the scale-2 tier ({@code CARD}, {@code BANNER}) and {@code LIGHTBOX@1} exist only when the source
 * renders without upscaling. Coinciding boxes may share a hash; serving takes either (ADR-0008).
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
