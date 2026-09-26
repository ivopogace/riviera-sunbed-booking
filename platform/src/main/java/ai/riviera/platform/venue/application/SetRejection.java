package ai.riviera.platform.venue.application;

/**
 * Why a beach-map write was rejected — the closed set of expected, caller-handled
 * failures shared by {@link AddSetOutcome} and {@link ChangeOutcome}. A lost layout (a taken
 * cell, a duplicate position) is normal flow, returned as a value, not thrown
 * (riviera-java-conventions: typed outcomes). The REST adapter maps each to one HTTP status:
 * {@code NO_SUCH_VENUE}/{@code NO_SUCH_SET}/{@code NO_SUCH_ROW}→404, {@code CELL_TAKEN}/
 * {@code DUPLICATE_POSITION}/{@code STALE_WRITE}/{@code SET_IN_USE}/{@code ROW_NAME_TAKEN}→409.
 */
public enum SetRejection {

	/** No venue has the given id. */
	NO_SUCH_VENUE,
	/** No set with the given id belongs to the venue. */
	NO_SUCH_SET,
	/** No set on the venue carries the given row label (the reprice and the rename share it). */
	NO_SUCH_ROW,
	/**
	 * Another writer bumped the venue's {@code set_version} since the tab loaded the map (optimistic
	 * concurrency). Reached by the token-guarded writes — reprice, rename, batch apply — never by the
	 * per-set {@code addSet}/{@code editSet}/{@code removeSet}. Maps to 409 {@code STALE_WRITE}.
	 */
	STALE_WRITE,
	/**
	 * Someone is still owed the set — a hold dated today or later, or a non-terminal booking — so a
	 * remove, or an edit that would reposition it, is refused; price, tier and pool never are.
	 * Finished bookings refuse neither; they make a removal retire the set (ADR-0019).
	 */
	SET_IN_USE,
	/** Another set already occupies the target {@code (grid_x, grid_y)} cell. */
	CELL_TAKEN,
	/** Another set already occupies the target {@code (row_label, position_no)} slot. */
	DUPLICATE_POSITION,
	/**
	 * Another row on the venue already carries the label a rename asks for. Broader than
	 * {@link #DUPLICATE_POSITION}: the DB accepts two rows sharing a label, but the tourist map, price
	 * rail and pricing tab group by label and would merge them. Renaming to its own label is a no-op.
	 */
	ROW_NAME_TAKEN
}
