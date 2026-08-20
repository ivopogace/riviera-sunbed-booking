package ai.riviera.platform.venue.application;

/**
 * Why a beach-map write was rejected (U7) — the closed set of expected, caller-handled
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
	 * The venue's {@code set_version} was bumped by another writer (a concurrent reprice or replace) since
	 * the tab loaded the map, so the conditional write is rejected rather than clobbering what is stored
	 * (optimistic-concurrency loss). Row-write-only, like {@link #NO_SUCH_ROW} — the reprice and the
	 * rename reach it; the shared {@code addSet}/{@code editSet}/{@code removeSet} paths never do.
	 * Maps to 409 {@code STALE_WRITE}.
	 */
	STALE_WRITE,
	/**
	 * The set is spoken for, so the requested layout write is refused (invariants #2/#3). Both writes
	 * refuse a hold dated today or later; they differ on the booking arm alone — a <em>remove</em> is
	 * refused by a booking of any status, because the RESTRICT FK pins the set, while an
	 * <em>edit</em> is refused only by a non-terminal one, and only when it would repool or
	 * reposition the set. The per-set counterpart of
	 * {@code ReplaceRejection.LAYOUT_IN_USE}, scoped to one set. Maps to 409 {@code SET_IN_USE}.
	 */
	SET_IN_USE,
	/** Another set already occupies the target {@code (grid_x, grid_y)} cell (invariant #12). */
	CELL_TAKEN,
	/** Another set already occupies the target {@code (row_label, position_no)} slot. */
	DUPLICATE_POSITION,
	/**
	 * Another row on the venue already carries the label a rename asks for, so the rename is refused
	 * (rename-only). Broader than {@link #DUPLICATE_POSITION} on purpose: two rows can share a label
	 * with no {@code (row_label, position_no)} pair colliding, which the database accepts — but the
	 * tourist map, the price rail and the pricing tab all group sets by label, so the two physical
	 * rows would silently read as one. Renaming a row to the label it already carries is a permitted
	 * no-op, not a collision. Maps to 409 {@code ROW_NAME_TAKEN}.
	 */
	ROW_NAME_TAKEN
}
