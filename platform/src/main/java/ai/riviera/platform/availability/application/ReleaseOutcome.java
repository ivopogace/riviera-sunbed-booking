package ai.riviera.platform.availability.application;

/**
 * The result of a staff {@link StaffAvailability#release release}. The REST adapter maps
 * {@code RELEASED} → 204 and {@code NOT_MARKED} → 409. {@code NOT_MARKED} covers every case where
 * no {@code STAFF_MARKED} row was deleted (the set was free, or held by an online booking the staff
 * release must never touch — invariant #2).
 */
public enum ReleaseOutcome {

	/** A {@code STAFF_MARKED} row was deleted; the set is FREE again. */
	RELEASED,

	/** Nothing to release — no {@code STAFF_MARKED} row existed for this {@code (set, date)}. */
	NOT_MARKED
}
