package ai.riviera.platform.venue.application;

/**
 * The closed set of outcomes of {@link EditVenueProfile#updateProfile}, dedicated to the profile
 * write rather than the beach-map edits' {@link ChangeOutcome}/{@link SetRejection}. A typed
 * outcome, not an exception — a lost optimistic-lock race ({@code STALE_WRITE}) is expected flow
 * (riviera-java-conventions §6). The REST adapter maps each via an exhaustive {@code switch}:
 * {@code APPLIED}→204, {@code NO_SUCH_VENUE}→404, {@code STALE_WRITE}→409.
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
