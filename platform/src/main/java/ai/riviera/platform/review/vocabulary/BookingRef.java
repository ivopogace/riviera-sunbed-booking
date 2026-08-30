package ai.riviera.platform.review.vocabulary;

/**
 * The {@code review} module's own reference to a booking (invariant #11). Published rather than
 * borrowed from {@code booking.vocabulary.BookingId} for the leaf-module reason on
 * {@link VenueRef}: {@code booking} implements this module's {@code spi} port, so an edge back to
 * {@code booking} for the id type would cycle.
 */
public record BookingRef(long value) {
}
