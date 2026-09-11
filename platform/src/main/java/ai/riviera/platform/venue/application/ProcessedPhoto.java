package ai.riviera.platform.venue.application;

import java.util.List;

/**
 * A photo the way it is stored: the per-surface {@link StoredVariant}s a single upload earned from
 * {@code PhotoProcessor} — three baselines always, the rest only where the source was large enough
 * to render them without upscaling. The unit {@link PhotoStorage#replace} persists atomically
 * for a {@code (venue, slot)} — the metadata row plus its variant bytes commit together (ADR-0008,
 * the no-orphaned-blob property).
 */
public record ProcessedPhoto(List<StoredVariant> variants) {
}
