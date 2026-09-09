package ai.riviera.platform.venue.vocabulary;

/**
 * A set's tier, {@link #PREMIUM} being the better of the two. Mirrors the {@code set_position_tier_check}
 * tokens one-to-one and is their single Java statement (ADR-0018 §3): the CHECK stays the
 * backstop, {@code SetCommand} derives its accepted tokens from here, and the wire keeps the names.
 * Declared worst-first so {@link #atLeast} reads off the order.
 */
public enum Tier {
	STANDARD,
	PREMIUM;

	/** Whether this tier is the same as or better than {@code other} — the move rule's "never worse". */
	public boolean atLeast(Tier other) {
		return compareTo(other) >= 0;
	}
}
