package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;

/**
 * One photo slot as a per-slot read model needs it (#142): the PREVIEW variant's serving URL, or
 * {@code null} when the slot is empty — emptiness IS the null URL; a separate boolean would be
 * derivable lock-step state (review F-11). Every venue carries all three slots, occupied or not, so
 * a consumer renders a stable slot grid rather than reconciling a list against the slot vocabulary.
 *
 * <p>Two consumers, deliberately sharing one shape: the operator console's Venue tab via
 * {@link VenueProfileView} (venue-scoped, ownership-asserted), and the platform-admin moderation
 * read via {@link VenuePhotoModeration#slotsOf} (ownership-free, #511). Only the authority differs;
 * the vocabulary should not.
 */
public record PhotoSlotView(PhotoSlot slot, String previewUrl) {
}
