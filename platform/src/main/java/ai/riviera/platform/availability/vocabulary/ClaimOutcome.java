package ai.riviera.platform.availability.vocabulary;

/**
 * The result of attempting to {@link ai.riviera.platform.availability.api.AvailabilityClaim#claim claim} a {@code (set, date)}.
 * A closed, caller-mappable set of outcomes — the {@code booking} module (U3) maps these to
 * HTTP results ({@code CLAIMED} → proceed, {@code ALREADY_TAKEN} → {@code 409},
 * {@code NOT_ONLINE_POOL} → {@code 422}, {@code NO_SUCH_SET} → {@code 404}). Returning a
 * value rather than throwing keeps the lost race a normal, expected flow, not an exception.
 */
public enum ClaimOutcome {

	/** The claim won: a {@code BOOKED_ONLINE} row now exists for this {@code (set, date)}. */
	CLAIMED,

	/** The {@code (set, date)} was already held (by an earlier or concurrent claim). */
	ALREADY_TAKEN,

	/** The set exists but is in the {@code WALK_IN} pool — not claimable online (invariant #3). */
	NOT_ONLINE_POOL,

	/** No set has the given id. */
	NO_SUCH_SET
}
