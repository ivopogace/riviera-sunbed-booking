package ai.riviera.platform.booking.api;

/**
 * The {@code booking} module's technical id, carried in cross-module event payloads (invariant
 * #11) so subscribers reference a booking by id, never by its aggregate. A thin wrapper over the
 * {@code booking.id} BIGINT identity column.
 */
public record BookingId(long value) {
}
