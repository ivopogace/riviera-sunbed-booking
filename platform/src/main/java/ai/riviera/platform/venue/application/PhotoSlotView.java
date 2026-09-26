package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;

/**
 * One photo slot as a per-slot read model needs it: the PREVIEW variant's serving URL, or
 * {@code null} when the slot is empty (emptiness IS the null URL). Every venue carries all three
 * slots, occupied or not, so a consumer renders a stable slot grid.
 *
 * <p>One shape for two consumers: the operator console's Venue tab via {@link VenueProfileView}
 * (ownership-asserted) and the platform-admin moderation read via
 * {@link VenuePhotoModeration#slotsOf} (ownership-free).
 */
public record PhotoSlotView(PhotoSlot slot, String previewUrl) {
}
