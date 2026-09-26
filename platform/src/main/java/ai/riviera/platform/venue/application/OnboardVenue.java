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
	 * Create a venue and record {@code creator} as its owner atomically (invariant #13), with no
	 * rating and the default commission from {@link VenueCreationProperties}, never the command. A
	 * malformed command throws {@link IllegalArgumentException} (400), per {@link NewVenueCommand}.
	 */
	VenueId onboard(OperatorId creator, NewVenueCommand command);
}
