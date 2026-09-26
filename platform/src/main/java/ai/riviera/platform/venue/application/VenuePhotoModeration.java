package ai.riviera.platform.venue.application;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Platform photo moderation (ADR-0013): every method is ownership-free by design, hence a port apart from
 * the ownership-first {@link VenuePhotos} (invariant #13). The {@code ADMIN} role gate on
 * {@code AdminVenuePhotoController} is the whole authorization, so nothing else may depend on this port.
 * Removal runs the one cascading {@link PhotoStorage#delete} (ADR-0008). Scope is one slot, not one image:
 * byte-identical variants in another slot keep serving. Rationale: RESPONSIBILITIES.md §venue.
 */
public interface VenuePhotoModeration {

	/**
	 * All three {@link PhotoSlot}s in declaration order, occupied ones with their PREVIEW URL and empty ones
	 * {@code null}, with no ownership check. An unknown venue answers three empty slots too, so the surface
	 * leaks no venue existence.
	 */
	List<PhotoSlotView> slotsOf(VenueId venueId);

	/**
	 * Remove the photo in {@code slot} (metadata and every variant, one statement), with no ownership check;
	 * {@code false} (→ 404) for an empty slot and an unknown venue alike.
	 */
	boolean takedown(VenueId venueId, PhotoSlot slot);
}
