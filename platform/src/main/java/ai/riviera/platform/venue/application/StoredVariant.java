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
 * {@code UNIQUE (photo_id, surface, scale)} constraint. Scale 1 is the baseline: unconditional for
 * {@code CARD}, {@code BANNER} and {@code PREVIEW}, and stored for {@code LIGHTBOX} only when the
 * upload fills its larger box. Scale 2 is the retina tier, for {@code CARD} and {@code BANNER}.
 * Both conditional cases turn on the same test: the source was large enough to render without
 * upscaling.
 *
 * <p>Two renditions of one photo can carry the same hash where their boxes coincide — a 2.29:1
 * upload renders {@code BANNER@2} and {@code LIGHTBOX@1} at the same 2200 x 960. They are
 * content-identical by construction, and the serving read takes either (ADR-0008).
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
