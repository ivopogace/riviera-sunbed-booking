package ai.riviera.platform.venue.application;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for an operator to read <strong>their own</strong> venue's beach map as the
 * layout editor needs it: the same map the tourist read composes, plus which sets a live claim
 * pins and why ({@link SetLock}). Hold and booking facts are operator data, so this read is what
 * keeps them off the public tourist surface. Internal to the {@code venue} module (REST-only
 * caller), so it lives in {@code application}, not {@code api/} (invariant #11), exactly like
 * {@link ViewDailyAvailability}.
 *
 * <p>Venue-scoped: the implementation verifies {@code operator} owns {@code venueId} before the
 * read (invariant #13, BOLA), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch. An
 * empty {@link Optional} — the venue vanished, or is hidden from tourists (the map read's fence,
 * which this read keeps) — maps to 404 in the controller.
 */
public interface ViewBeachMap {

	/**
	 * The owner's venue map with its locked sets, ordered by set id — or empty if the map read
	 * answers nothing (after asserting ownership).
	 */
	Optional<OperatorBeachMap> beachMapFor(OperatorId operator, VenueId venueId);
}
