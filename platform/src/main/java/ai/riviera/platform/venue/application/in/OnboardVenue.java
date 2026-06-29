package ai.riviera.platform.venue.application.in;

import ai.riviera.platform.venue.api.VenueId;

/**
 * Driving (inbound) port for onboarding a venue (U7). Internal to the {@code venue} module —
 * the only caller is the module's own REST adapter, so it lives in {@code application.in}, not
 * the cross-module {@code api/} surface (invariant #11). A deep, single-method conversation:
 * the implementation hides input validation and the insert.
 */
public interface OnboardVenue {

	/**
	 * Create a venue from a validated command and return its new technical id. The venue starts
	 * with no rating and no reviews. A malformed command surfaces as {@link IllegalArgumentException}
	 * (mapped to {@code 400} by the adapter); validation lives in {@link NewVenueCommand}.
	 */
	VenueId onboard(NewVenueCommand command);
}
