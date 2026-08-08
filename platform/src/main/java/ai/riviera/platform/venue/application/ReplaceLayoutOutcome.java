package ai.riviera.platform.venue.application;

/**
 * The closed set of outcomes of {@link EditBeachMap#replaceLayout}. Sealed so the
 * REST adapter {@code switch}es exhaustively: {@code Replaced}→204, {@code Rejected}→the
 * {@link ReplaceRejection}'s HTTP status.
 */
public sealed interface ReplaceLayoutOutcome
		permits ReplaceLayoutOutcome.Replaced, ReplaceLayoutOutcome.Rejected {

	/** The whole layout was replaced. A stateless singleton — there is nothing to carry. */
	enum Replaced implements ReplaceLayoutOutcome {
		REPLACED
	}

	/** The layout was not replaced; the reason maps to an HTTP status in the controller. */
	record Rejected(ReplaceRejection reason) implements ReplaceLayoutOutcome {
	}
}
