package ai.riviera.platform.venue.application.in;

import ai.riviera.platform.venue.api.SetId;

/**
 * The closed set of outcomes of {@link EditBeachMap#addSet}. Sealed so the REST adapter
 * {@code switch}es exhaustively: {@code Added}→201 with the new {@link SetId},
 * {@code Rejected}→the {@link SetRejection}'s HTTP status.
 */
public sealed interface AddSetOutcome permits AddSetOutcome.Added, AddSetOutcome.Rejected {

	/** The set was placed; carries its new technical id. */
	record Added(SetId setId) implements AddSetOutcome {
	}

	/** The set was not placed; the reason maps to an HTTP status in the controller. */
	record Rejected(SetRejection reason) implements AddSetOutcome {
	}
}
