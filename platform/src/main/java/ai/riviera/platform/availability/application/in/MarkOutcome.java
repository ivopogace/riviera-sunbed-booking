package ai.riviera.platform.availability.application.in;

/**
 * The result of a staff {@link StaffAvailability#mark mark}. A closed, caller-mappable set the
 * REST adapter maps to HTTP ({@code MARKED} → 200, {@code ALREADY_TAKEN} → 409,
 * {@code NO_SUCH_SET} → 404, {@code DATE_IN_PAST} → 422). Returning a value rather than throwing
 * keeps a lost race and a stale date as normal flow.
 */
public enum MarkOutcome {

	/** The mark won: a {@code STAFF_MARKED} row now exists for this {@code (set, date)}. */
	MARKED,

	/** The {@code (set, date)} was already held — by an online booking or another staff mark. */
	ALREADY_TAKEN,

	/** No set has the given id. */
	NO_SUCH_SET,

	/** The date is before today in {@code Europe/Tirane} — staff act on today and beyond (invariant #4/#6). */
	DATE_IN_PAST
}
