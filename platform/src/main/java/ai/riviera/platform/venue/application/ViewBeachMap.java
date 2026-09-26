package ai.riviera.platform.venue.application;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving port for an operator to read <strong>their own</strong> venue's beach map for the layout
 * editor: the tourist map plus which sets a live claim pins and why ({@link SetLock}); hold facts
 * are operator data and stay off the public surface. Module-internal, so {@code application}, not
 * {@code api/} (invariant #11), like {@link ViewDailyAvailability}.
 *
 * <p>Asserts ownership first (invariant #13) → {@code NotVenueOwnerException} (403). Empty — the
 * venue vanished or is tourist-hidden (the map read's fence, kept) — maps to 404 in the controller.
 */
public interface ViewBeachMap {

	/**
	 * The owner's venue map with its locked sets, ordered by set id — or empty if the map read
	 * answers nothing (after asserting ownership).
	 */
	Optional<OperatorBeachMap> beachMapFor(OperatorId operator, VenueId venueId);
}
