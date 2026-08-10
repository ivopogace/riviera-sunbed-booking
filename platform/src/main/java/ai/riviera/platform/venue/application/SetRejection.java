package ai.riviera.platform.venue.application;

/**
 * Why a beach-map write was rejected (U7) — the closed set of expected, caller-handled
 * failures shared by {@link AddSetOutcome} and {@link ChangeOutcome}. A lost layout (a taken
 * cell, a duplicate position) is normal flow, returned as a value, not thrown
 * (riviera-java-conventions: typed outcomes). The REST adapter maps each to one HTTP status:
 * {@code NO_SUCH_VENUE}/{@code NO_SUCH_SET}/{@code NO_SUCH_ROW}→404, {@code CELL_TAKEN}/
 * {@code DUPLICATE_POSITION}/{@code STALE_WRITE}/{@code SET_IN_USE}→409.
 */
public enum SetRejection {

	/** No venue has the given id. */
	NO_SUCH_VENUE,
	/** No set with the given id belongs to the venue. */
	NO_SUCH_SET,
	/** No set on the venue carries the given row label. */
	NO_SUCH_ROW,
	/**
	 * The venue's {@code set_version} was bumped by another writer (a concurrent reprice or replace) since
	 * the tab loaded the map, so the conditional bump matched no row — the reprice is rejected rather than
	 * clobbering the current prices (optimistic-concurrency loss). Reprice-only, like
	 * {@link #NO_SUCH_ROW} (the shared {@code addSet}/{@code editSet}/{@code removeSet} paths never reach
	 * it). Maps to 409 {@code STALE_WRITE}.
	 */
	STALE_WRITE,
	/**
	 * The set has a claim — an availability hold (any date) or a booking (any status) — so it may
	 * not be removed, nor repositioned or moved between pools (invariants #2/#3). The per-set
	 * counterpart of {@code ReplaceRejection.LAYOUT_IN_USE}, scoped to the one set rather than the
	 * whole venue. Price and tier edits are unaffected. Maps to 409 {@code SET_IN_USE}.
	 */
	SET_IN_USE,
	/** Another set already occupies the target {@code (grid_x, grid_y)} cell (invariant #12). */
	CELL_TAKEN,
	/** Another set already occupies the target {@code (row_label, position_no)} slot. */
	DUPLICATE_POSITION
}
