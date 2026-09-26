package ai.riviera.platform.venue.application;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving port for an operator to read <strong>their own</strong> venue's admin profile — the
 * Venue &amp; commodities tab's pre-fill, including the commission + payout currency the public
 * tourist read must not expose. Module-internal, so {@code application}, not {@code api/}
 * (invariant #11), like {@link EditVenueProfile}.
 *
 * <p>Asserts ownership first (invariant #13) → {@code NotVenueOwnerException} (403), so no operator
 * reads another's commission rate. An empty result (venue vanished) maps to 404 in the controller.
 */
public interface ViewVenueProfile {

	/** The owner's venue profile, or empty if the venue no longer exists (after asserting ownership). */
	Optional<VenueProfileView> profileFor(OperatorId operator, VenueId venueId);
}
