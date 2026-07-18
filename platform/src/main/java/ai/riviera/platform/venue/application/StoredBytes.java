package ai.riviera.platform.venue.application;

import java.util.Arrays;
import java.util.Objects;

import ai.riviera.platform.venue.vocabulary.ContentHash;

/**
 * The bytes of one variant on the serving path — the only carrier that pulls the {@code bytea} out
 * of the database, and only on a content-hash lookup ({@link PhotoStorage#loadBytes}), never a list
 * query. The controller returns these with an immutable {@code Cache-Control} + {@code ETag} keyed
 * on the {@link ContentHash} (ADR-0008), so the blob is read ≈once per image.
 *
 * <p>{@code equals}/{@code hashCode} compare the array by CONTENT (java:S6218 — the record default
 * would use reference identity); {@code toString} renders the byte count, never the payload.
 */
public record StoredBytes(ContentHash hash, String contentType, byte[] bytes) {

	@Override
	public boolean equals(Object other) {
		return other instanceof StoredBytes(var otherHash, var otherType, var otherBytes)
				&& hash.equals(otherHash) && contentType.equals(otherType)
				&& Arrays.equals(bytes, otherBytes);
	}

	@Override
	public int hashCode() {
		return Objects.hash(hash, contentType, Arrays.hashCode(bytes));
	}

	@Override
	public String toString() {
		return "StoredBytes[hash=" + hash + ", contentType=" + contentType
				+ ", bytes=" + bytes.length + "B]";
	}
}
