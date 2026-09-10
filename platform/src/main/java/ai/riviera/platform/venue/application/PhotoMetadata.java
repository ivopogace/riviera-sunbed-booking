package ai.riviera.platform.venue.application;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;

/**
 * The stored photos of a venue, blob-free — one entry per occupied {@link PhotoSlot} with its
 * per-rendition {@link VariantMeta}. Returned by {@link PhotoStorage#listMetadata} to drive the
 * platform-admin moderation read; the serving URLs are built from each rendition's content hash.
 * A surface appears once per stored density, so it does not key the list. The tourist and operator
 * read models are built by their own SQL in the JDBC adapters, not from here — a split noted so
 * nobody assumes this record is on those paths.
 */
public record PhotoMetadata(PhotoSlot slot, List<VariantMeta> variants) {
}
