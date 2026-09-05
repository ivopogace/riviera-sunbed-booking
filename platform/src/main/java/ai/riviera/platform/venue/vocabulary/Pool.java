package ai.riviera.platform.venue.vocabulary;

/**
 * Which channel a set draws from: an app booking may target {@link #ONLINE} sets only (invariant
 * #3); {@link #WALK_IN} sets are held back for guests arriving in person. A set is in exactly one
 * pool. Mirrors the {@code set_position_pool_check} tokens one-to-one and is their single Java
 * statement (ADR-0018 §3): the CHECK stays the race-safe backstop, and every module compares
 * against this type rather than a literal of its own.
 */
public enum Pool {
	ONLINE,
	WALK_IN
}
