package ai.riviera.platform.venue.application;

/**
 * The closed set of outcomes of {@link EditBeachMap#applyToSets}. Sealed so the REST adapter
 * {@code switch}es exhaustively: {@code Applied}→200 with the count, {@code Rejected}→the
 * {@link SetRejection}'s HTTP status.
 */
public sealed interface SetBatchOutcome permits SetBatchOutcome.Applied, SetBatchOutcome.Rejected {

	/** Every named set was changed; carries how many, so the console can say "N sets updated". */
	record Applied(int updated) implements SetBatchOutcome {
	}

	/** Nothing was written; the reason maps to an HTTP status in the controller. */
	record Rejected(SetRejection reason) implements SetBatchOutcome {
	}
}
