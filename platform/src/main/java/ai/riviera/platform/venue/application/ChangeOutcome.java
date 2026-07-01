package ai.riviera.platform.venue.application;

/**
 * The closed set of outcomes of {@link EditBeachMap#editSet} and {@link EditBeachMap#removeSet}
 * — operations that change an existing set and return no new id. Sealed for exhaustive mapping:
 * {@code APPLIED}→204, {@code Rejected}→the {@link SetRejection}'s HTTP status.
 */
public sealed interface ChangeOutcome permits ChangeOutcome.Applied, ChangeOutcome.Rejected {

	/** The edit or removal was applied. A stateless singleton — there is nothing to carry. */
	enum Applied implements ChangeOutcome {
		APPLIED
	}

	/** The change was not applied; the reason maps to an HTTP status in the controller. */
	record Rejected(SetRejection reason) implements ChangeOutcome {
	}
}
