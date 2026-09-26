package ai.riviera.platform.venue.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The module-internal outbound port for where venue photo bytes live — the swappable storage seam
 * (ADR-0008). The default {@code JdbcPhotoStorage} keeps the resized variants in {@code bytea},
 * atomic with their metadata (no orphaned blob); an object-store adapter is the one-swap scale-out
 * path past ADR-0008's flip threshold. Not in {@code api/} (invariant #11). Validation, EXIF-strip
 * and resize are {@code PhotoProcessor}'s; this port only persists, serves and deletes variants.
 */
public interface PhotoStorage {

	/**
	 * Persist {@code photo}'s variants for {@code (venueId, slot)}, atomically replacing the slot's
	 * photo in one transaction: the slot-row upsert's lock serializes concurrent replaces (last writer
	 * wins), then the variants swap. At most one photo per slot ({@code UNIQUE(venue_id, slot)}).
	 */
	void replace(VenueId venueId, PhotoSlot slot, ProcessedPhoto photo);

	/**
	 * Remove the photo (metadata + every variant's bytes) in {@code (venueId, slot)} in one
	 * transaction — the single-{@code DELETE} GDPR-erasure property (ADR-0008). Returns {@code true}
	 * if a photo was present, {@code false} if the slot was already empty.
	 */
	boolean delete(VenueId venueId, PhotoSlot slot);

	/**
	 * Load one variant's bytes by its content hash for the serving path — the only method that
	 * touches the {@code bytea} column. Scoped by {@code venueId} so the public route stays
	 * venue-addressed. {@link Optional#empty()} for an unknown hash (→ {@code 404}).
	 */
	Optional<StoredBytes> loadBytes(VenueId venueId, ContentHash hash);

	/**
	 * Whether {@code (venueId, hash)} still names a stored variant — the conditional-GET path's
	 * blob-free question: an index probe on {@code venue_photo_variant_serving_idx}, never the
	 * {@code bytea}. Answered from the URL alone, a taken-down photo would revalidate as {@code 304}.
	 */
	boolean exists(VenueId venueId, ContentHash hash);

	/**
	 * The venue's stored photos, <strong>blob-free</strong> — one {@link PhotoMetadata} per occupied
	 * slot, for the platform-admin moderation read — its one caller. Never selects the
	 * {@code bytea} column. The tourist and operator read models run their own SQL in the adapters.
	 */
	List<PhotoMetadata> listMetadata(VenueId venueId);
}
