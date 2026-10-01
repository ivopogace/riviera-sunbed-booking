package ai.riviera.platform.venue.application;

/** One variant's bytes plus the {@link PhotoAudience} the serving response may be cached for. */
public record ServedPhoto(StoredBytes bytes, PhotoAudience audience) {
}
