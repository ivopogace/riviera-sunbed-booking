package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for onboarding a venue (U7). Internal to the {@code venue} module —
 * the only caller is the module's own REST adapter, so it lives in {@code application}, not
 * the cross-module {@code api/} surface (invariant #11). A deep, single-method conversation:
 * the implementation hides input validation, the insert, and the creator-owns-on-create ownership write.
 */
public interface OnboardVenue {

	/**
	 * Create a venue from a validated command and record {@code creator} as its owner atomically
	 * (creator-owns-on-create, #115) — the venue starts owned by the operator that created it, so the
	 * invariant-#13 ownership checks pass for the creator and reject everyone else. The venue starts
	 * with no rating and no reviews. A malformed command surfaces as {@link IllegalArgumentException}
	 * (mapped to {@code 400} by the adapter); validation lives in {@link NewVenueCommand}.
	 */
	VenueId onboard(OperatorId creator, NewVenueCommand command);
}
