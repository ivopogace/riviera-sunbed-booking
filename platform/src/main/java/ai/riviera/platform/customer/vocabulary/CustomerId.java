package ai.riviera.platform.customer.vocabulary;

/**
 * Technical id of a {@code Customer} (invariant #11 — cross-module references and event
 * payloads carry typed ids, not foreign aggregates). Returned by {@link ai.riviera.platform.customer.api.CustomerDirectory CustomerDirectory}
 * and held by a {@code Booking}.
 */
public record CustomerId(long value) {
}
