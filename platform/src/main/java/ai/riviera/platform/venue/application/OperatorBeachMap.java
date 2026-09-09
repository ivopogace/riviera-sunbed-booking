package ai.riviera.platform.venue.application;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.VenueMapView;

/**
 * The owner's beach-map read: the venue map exactly as the tourist read composes it (so the editor
 * seeds prices, row names and the {@code setVersion} token from the one shape) beside the sparse
 * list of sets a live claim pins, ordered by set id — a free set has no entry. Internal to the
 * {@code venue} module (REST-only consumer), so it lives in {@code application} (invariant #11).
 */
public record OperatorBeachMap(VenueMapView map, List<SetLock> locks) {
}
