package ai.riviera.platform.review.domain;

/**
 * What a stay's one review slot holds right now — nothing, the guest's verdict, or a verdict a
 * platform admin has taken out of public view. One value rather than two booleans, so the gate
 * cannot be asked the contradictory "hidden but not taken".
 */
public enum ReviewSlot {

	/** No review has been recorded against this stay. */
	EMPTY,

	/** The guest's review stands, in public view. */
	TAKEN,

	/** The guest's review stands, but an admin has hidden it; its author may read it, not change it. */
	HIDDEN
}
