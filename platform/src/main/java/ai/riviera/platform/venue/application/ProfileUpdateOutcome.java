package ai.riviera.platform.venue.application;

/**
 * The closed set of outcomes of {@link EditVenueProfile#updateProfile}. Dedicated to the
 * profile write — unlike the shared {@link ChangeOutcome}/{@link SetRejection}, it can be
 * {@code STALE_WRITE} (optimistic-concurrency loss), a state the beach-map edits
 * ({@code addSet}/{@code editSet}/{@code repriceRow}/{@code replaceLayout}) can never reach, so it
 * does not belong on their shared rejection type. A typed outcome, not an exception — a lost
 * optimistic-lock race is expected flow (riviera-java-conventions §6). The REST adapter maps each
 * to one HTTP status via an exhaustive {@code switch}: {@code APPLIED}→204, {@code NO_SUCH_VENUE}→404,
 * {@code STALE_WRITE}→409.
 */
public enum ProfileUpdateOutcome {

	/** The profile was replaced and the row's version bumped. */
	APPLIED,
	/** No venue has the given id. */
	NO_SUCH_VENUE,
	/**
	 * Another writer bumped the row's version since the tab loaded it, so the conditional {@code UPDATE}
	 * matched no row — the write is rejected rather than clobbering {@code booking_mode}/{@code booking_cutoff}
	 * (closing a last-write-wins hole). The tab reloads the latest values and re-applies.
	 */
	STALE_WRITE
}
