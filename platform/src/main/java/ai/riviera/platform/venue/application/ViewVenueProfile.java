package ai.riviera.platform.venue.application;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for an operator to read <strong>their own</strong> venue's admin profile
 * (O8, issue #177) — the values the Venue &amp; commodities tab pre-fills, including the read-only
 * commission + payout currency that the public tourist read must not expose. Internal to the
 * {@code venue} module (REST-only caller), so it lives in {@code application}, not {@code api/}
 * (invariant #11), exactly like {@link EditVenueProfile}.
 *
 * <p>Venue-scoped: the implementation verifies {@code operator} owns {@code venueId} before the read
 * (invariant #13, BOLA), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch — so an
 * operator can never read another operator's commission rate. An empty {@link Optional} (venue
 * vanished after the ownership grant) maps to 404 in the controller.
 */
public interface ViewVenueProfile {

	/** The owner's venue profile, or empty if the venue no longer exists (after asserting ownership). */
	Optional<VenueProfileView> profileFor(OperatorId operator, VenueId venueId);
}
