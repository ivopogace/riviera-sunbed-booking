package ai.riviera.platform.venue.api;

/**
 * Technical identifier of a {@code SetPosition} — the bookable unit (2 loungers + umbrella)
 * on a venue's beach map. The {@code venue} module owns {@code SetPosition} (it is part of
 * the {@code BeachMap} aggregate), so its id lives on venue's published surface alongside
 * {@link VenueId} and crosses module boundaries via {@code api/} ports and event payloads
 * (invariant #11). Backed by a {@code BIGINT} identity column — the unguessable bearer
 * credential in this system is the booking code (invariant #7), not the set id.
 */
public record SetId(long value) {
}
