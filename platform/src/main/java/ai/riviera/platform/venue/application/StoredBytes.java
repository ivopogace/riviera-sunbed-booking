package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.ContentHash;

/**
 * The bytes of one variant on the serving path — the only carrier that pulls the {@code bytea} out
 * of the database, and only on a content-hash lookup ({@link PhotoStorage#loadBytes}), never a list
 * query. The controller returns these with an immutable {@code Cache-Control} + {@code ETag} keyed
 * on the {@link ContentHash} (ADR-0008), so the blob is read ≈once per image.
 */
public record StoredBytes(ContentHash hash, String contentType, byte[] bytes) {
}
