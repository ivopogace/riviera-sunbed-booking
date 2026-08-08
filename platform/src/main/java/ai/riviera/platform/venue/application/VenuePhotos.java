package ai.riviera.platform.venue.application;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue-photo use cases the driving adapter calls (inbound port, invariant #11). The two writes
 * ({@link #upload}, {@link #delete}) are venue-scoped and assert the operator owns the venue
 * <strong>first</strong> (invariant #13, BOLA); the two reads ({@link #serve}, {@link #exists}) are
 * the <strong>public</strong> tourist serving path and carry no ownership check.
 * Implemented by {@code VenuePhotoService}.
 */
public interface VenuePhotos {

	/**
	 * Validate + resize the upload and store it in {@code slot}, replacing any existing photo there.
	 * Asserts ownership before any processing. Returns {@link PhotoUploadResult.Stored} with the new
	 * variant metadata (for the immediate operator preview) or {@link PhotoUploadResult.Rejected}.
	 */
	PhotoUploadResult upload(OperatorId operator, VenueId venueId, PhotoSlot slot, byte[] image);

	/**
	 * Remove the photo in {@code slot} (metadata + bytes). Asserts ownership first. Returns
	 * {@code true} if a photo was present, {@code false} if the slot was already empty (→ 404).
	 */
	boolean delete(OperatorId operator, VenueId venueId, PhotoSlot slot);

	/**
	 * Load one variant's bytes by content hash for the public serving path — no ownership check
	 * (tourist reads are public). {@link Optional#empty()} for an unknown hash (→ 404).
	 */
	Optional<StoredBytes> serve(VenueId venueId, ContentHash hash);

	/**
	 * Whether {@code hash} still names a servable variant of {@code venueId} — the public
	 * conditional-GET question, answered without reading the bytes. No ownership check, like
	 * {@link #serve}. Turns {@code false} the moment the photo is deleted or taken down, which is
	 * what makes a removal reach a client that already holds the bytes and the {@code ETag}.
	 */
	boolean exists(VenueId venueId, ContentHash hash);
}
