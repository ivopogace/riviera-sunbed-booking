package ai.riviera.platform.venue.application;

import java.util.List;

/**
 * A photo the way it is stored: the fixed set of per-surface {@link StoredVariant}s produced from a
 * single upload by {@code PhotoProcessor}. The unit {@link PhotoStorage#replace} persists atomically
 * for a {@code (venue, slot)} — the metadata row plus its variant bytes commit together (ADR-0008,
 * the no-orphaned-blob property).
 */
public record ProcessedPhoto(List<StoredVariant> variants) {
}
