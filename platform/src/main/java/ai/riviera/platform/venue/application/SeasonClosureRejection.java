package ai.riviera.platform.venue.application;

/** Why a close was refused; each maps to one HTTP status in the controller. */
public enum SeasonClosureRejection {
	/** No venue has that id (→ 404). */
	NO_SUCH_VENUE,
	/** The reopen day is today or earlier in {@code Europe/Tirane} — the closure would already be over (→ 422). */
	REOPEN_DATE_PASSED
}
