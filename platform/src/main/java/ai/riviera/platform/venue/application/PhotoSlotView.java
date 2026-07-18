package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;

/**
 * One photo slot as the operator console's Venue tab needs it (#142): the PREVIEW variant's
 * serving URL, or {@code null} when the slot is empty — emptiness IS the null URL; a separate
 * boolean would be derivable lock-step state (review F-11). Part of {@link VenueProfileView} —
 * every venue carries all three slots, occupied or not, so the form renders a stable slot grid.
 */
public record PhotoSlotView(PhotoSlot slot, String previewUrl) {
}
