package ai.riviera.platform.venue.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The module-internal <strong>outbound</strong> port for where venue photo bytes live — the
 * swappable storage seam (ADR-0008). It is the project's storage-agnostic boundary: the {@code venue}
 * application layer depends on this interface, not on {@code bytea} or S3. The default
 * {@code JdbcPhotoStorage} adapter keeps the resized variants in Postgres {@code bytea} (atomic with
 * their metadata — no orphaned blob); a future object-store adapter is the documented one-swap
 * scale-out path, chosen only past the flip threshold in ADR-0008.
 *
 * <p>Not part of the module's {@code api/} — only {@code venue}'s own application layer depends on it
 * (invariant #11), mirroring {@code payment}'s {@code PaymentGateway}. Image validation / EXIF-strip /
 * resize is <em>not</em> here — that is the pure {@code PhotoProcessor}; this port only persists,
 * serves, and deletes the already-processed variants.
 */
public interface PhotoStorage {

	/**
	 * Persist {@code photo}'s variants for {@code (venueId, slot)}, replacing any existing photo in
	 * that slot <strong>atomically</strong> (a slot-row upsert whose row lock also serializes
	 * concurrent replaces — last writer wins — then a variant swap, in one transaction) — at most
	 * one photo per slot (enforced in the DB by {@code UNIQUE(venue_id, slot)} too).
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
	 * The venue's stored photos, <strong>blob-free</strong> — one {@link PhotoMetadata} per occupied
	 * slot, for the platform-admin moderation read (#511) — its one caller. Never selects the
	 * {@code bytea} column. The tourist and operator read models run their own SQL in the adapters.
	 */
	List<PhotoMetadata> listMetadata(VenueId venueId);
}
