package ai.riviera.platform.venue.api;

/**
 * Technical identifier of a {@code Venue}. A publishable id (invariant #11 — ids cross
 * module boundaries via {@code api/} ports and event payloads), so it lives on the
 * module's published surface, not in an internal package. Backed by a {@code BIGINT}
 * identity column (the unguessable bearer credential in this system is the booking code,
 * invariant #7, not the venue id).
 */
public record VenueId(long value) {
}
