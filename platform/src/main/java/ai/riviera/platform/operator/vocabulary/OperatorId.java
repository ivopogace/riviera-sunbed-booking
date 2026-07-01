package ai.riviera.platform.operator.vocabulary;

/**
 * Technical id of an {@code Operator} (invariant #11 — cross-module references carry typed ids,
 * not foreign aggregates). Resolved from the authenticated principal by {@link OperatorDirectory}
 * and passed by each venue-scoped application service to {@link VenueOwnership#assertOwns}.
 */
public record OperatorId(long value) {
}
