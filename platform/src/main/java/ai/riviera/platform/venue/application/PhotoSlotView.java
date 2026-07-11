package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;

/**
 * One photo slot as the operator console's Venue tab needs it (#142): whether the slot holds a
 * photo, and the PREVIEW variant's serving URL when it does ({@code null} when empty). Part of
 * {@link VenueProfileView} — every venue carries all three slots, occupied or not, so the form
 * renders a stable slot grid.
 */
public record PhotoSlotView(PhotoSlot slot, boolean present, String previewUrl) {
}
