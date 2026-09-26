package ai.riviera.platform.venue.application;

import java.util.Arrays;
import java.util.Objects;

import ai.riviera.platform.venue.vocabulary.ContentHash;

/**
 * The bytes of one variant on the serving path — the only carrier of the {@code bytea}, loaded only
 * by content hash ({@link PhotoStorage#loadBytes}), never by a list query. Served with a
 * revalidating {@code ETag} keyed on the {@link ContentHash} (ADR-0008), so the blob is read ≈once
 * per image; a revalidation is answered by {@link PhotoStorage#exists}, which never touches it.
 *
 * <p>{@code equals}/{@code hashCode} compare the array by CONTENT (java:S6218); {@code toString}
 * renders the byte count, never the payload.
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
