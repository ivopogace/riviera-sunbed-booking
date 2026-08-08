package ai.riviera.platform.venue.application;

import java.util.List;

import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Driving port: "which venues does this operator own, and what are they called?"
 * Internal to the module — the only caller is this module's own {@code adapter.in}, so it is NOT
 * published in {@code api/} (invariant #11); it exists to give the web adapter a mockable seam and
 * to keep the role-split shape of its siblings ({@link OnboardVenue}, {@link EditBeachMap},
 * {@link EditVenueProfile}, {@link ViewVenueProfile}).
 *
 * <p><strong>Why {@code venue} owns this and not {@code operator}:</strong> {@code operator} owns the
 * ownership <em>mapping</em> and answers the authorization question; assembling a venue read model is
 * {@code venue}'s job, and {@code venue} already depends on {@code operator::api} — the reverse edge
 * would cycle (which is precisely why {@code operator.vocabulary.VenueRef} exists).
 */
public interface ListOwnedVenues {

	/**
	 * The venues {@code operator} owns, as picker summaries, ordered by name. Ownership is the
	 * explicit {@code operator_venue} mapping (invariant #13; the owns-all bootstrap is retired),
	 * so the result is <strong>session-scoped by construction</strong> — the caller passes the
	 * authenticated principal's id and there is no venue id in the request to tamper with (BOLA-safe
	 * without an {@code assertOwns}, because the mapping itself is the filter). An operator that owns
	 * nothing gets an empty list, never {@code null} and never a 404.
	 */
	List<OwnedVenueView> ownedBy(OperatorId operator);
}
