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
 * the public serving path, fenced on the venue's tourist visibility with an owner/admin bypass
 * (ADR-0013). Implemented by {@code VenuePhotoService}.
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
	 * Load one variant's bytes by content hash for {@code viewer}, with the audience it may be cached
	 * for. Empty for an unknown hash, or a hidden venue the viewer may not preview (→ 404).
	 */
	Optional<ServedPhoto> serve(PhotoViewer viewer, VenueId venueId, ContentHash hash);

	/**
	 * The conditional-GET twin of {@link #serve}, fenced the same and answered without the bytes:
	 * empty once the photo is removed or the venue is hidden from {@code viewer}, so neither revalidates.
	 */
	Optional<PhotoAudience> exists(PhotoViewer viewer, VenueId venueId, ContentHash hash);
}
