package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import java.util.List;

/**
 * The closed set of outcomes of {@link EditBeachMap#replaceLayout}. Sealed so the
 * REST adapter {@code switch}es exhaustively: {@code Replaced}→204, {@code SetsInUse}→409 with the
 * blocking sets, {@code Rejected}→the {@link LayoutRejection}'s HTTP status.
 */
public sealed interface ReplaceLayoutOutcome
		permits ReplaceLayoutOutcome.Replaced, ReplaceLayoutOutcome.SetsInUse, ReplaceLayoutOutcome.Rejected {

	/** The layout was saved. A stateless singleton — there is nothing to carry. */
	enum Replaced implements ReplaceLayoutOutcome {
		REPLACED
	}

	/**
	 * The save would remove a set someone is still owed — a hold dated today or later, or a booking
	 * that can still be honoured — so the whole save is refused and nothing is written. Carries every
	 * such set, in map order, so the operator can keep exactly those (invariant #2).
	 */
	record SetsInUse(List<BlockedSet> sets) implements ReplaceLayoutOutcome {
		public SetsInUse {
			sets = List.copyOf(sets);
			if (sets.isEmpty()) {
				throw new IllegalArgumentException("a refusal names at least one set");
			}
		}
	}

	/** The layout was not saved; the reason maps to an HTTP status in the controller. */
	record Rejected(LayoutRejection reason) implements ReplaceLayoutOutcome {
	}
}
