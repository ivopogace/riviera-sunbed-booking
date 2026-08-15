package ai.riviera.platform.venue.vocabulary;

/**
 * The three designed venue photo slots: the {@code COVER} (sea view — surfaced to tourists on
 * Discover cards + the beach-map banner), plus {@code SUNBEDS} and {@code BAR}, tourist-surfaced
 * only in the Discover card's photo slideshow — and, as always, visible to the venue's own operator
 * and to a platform admin moderating them. At most one photo per {@code (venue, slot)} — a
 * re-upload replaces.
 *
 * <p>The enum name is the wire + DB token (DB {@code CHECK (slot IN ('COVER','SUNBEDS','BAR'))},
 * mirroring {@code BookingMode} / {@code Amenity}); the REST path carries the lower-case form.
 */
public enum PhotoSlot {
	COVER,
	SUNBEDS,
	BAR
}
