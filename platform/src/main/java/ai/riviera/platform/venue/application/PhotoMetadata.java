package ai.riviera.platform.venue.application;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;

/**
 * The stored photos of a venue, blob-free — one entry per occupied {@link PhotoSlot} with its
 * per-surface {@link VariantMeta}. Returned by {@link PhotoStorage#listMetadata} to drive the
 * tourist + operator read models; the serving URLs are built from each variant's content hash.
 */
public record PhotoMetadata(PhotoSlot slot, List<VariantMeta> variants) {
}
