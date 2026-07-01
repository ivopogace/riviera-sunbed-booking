package ai.riviera.platform.operator.api;

/**
 * The {@code operator} module's own reference to a venue (invariant #11 — a typed id at the seam,
 * not a raw {@code long}).
 *
 * <p><strong>Why not reuse {@code venue.api.VenueId}?</strong> One of the five venue-scoped
 * services that must ask the ownership question — {@code venue}'s own {@code VenueAdminService}
 * (beach-map edits) — lives inside the {@code venue} module. If {@code operator.api} depended on
 * {@code venue::api}, then {@code venue → operator} (to call {@link VenueOwnership}) plus
 * {@code operator → venue} (for {@code VenueId}) would form a Spring Modulith cycle. Publishing a
 * dedicated {@code VenueRef} keeps {@code operator}'s {@code allowedDependencies} empty and the
 * module graph acyclic, so a <em>single uniform</em> {@code api} port serves all five callers.
 * Callers convert with {@code new VenueRef(venueId.value())}.
 */
public record VenueRef(long value) {
}
