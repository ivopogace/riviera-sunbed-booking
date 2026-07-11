package ai.riviera.platform.venue.application;

/**
 * Why a bulk beach-map layout replace was rejected (O3, issue #172) — the closed set of expected,
 * caller-handled failures of {@link EditBeachMap#replaceLayout}. Returned as a value, not thrown
 * (riviera-java-conventions: typed outcomes). The REST adapter maps each to one HTTP status:
 * {@code NO_SUCH_VENUE}→404, {@code LAYOUT_IN_USE}/{@code STALE_WRITE}→409,
 * {@code DUPLICATE_POSITION}/{@code CELL_TAKEN}→409, {@code EMPTY_LAYOUT}/{@code LAYOUT_TOO_LARGE}→400.
 */
public enum ReplaceRejection {

	/** No venue has the given id. */
	NO_SUCH_VENUE,
	/**
	 * The venue's {@code set_version} was bumped by another writer (a concurrent replace or reprice) since
	 * the tab loaded the map, so the conditional bump matched no row — the replace is rejected rather than
	 * clobbering the current layout (optimistic-concurrency loss, #226). The tab reloads the latest map and
	 * re-applies. Maps to 409 {@code STALE_WRITE}.
	 */
	STALE_WRITE,
	/**
	 * The venue has an existing claim — a booking (any status) or an availability hold (any date) — so a
	 * destructive replace is refused (reject-unless-unclaimed; invariants #2/#3, issue #172).
	 */
	LAYOUT_IN_USE,
	/** Two submitted cells share the same {@code (row_label, position_no)} slot. */
	DUPLICATE_POSITION,
	/** Two submitted cells share the same {@code (grid_x, grid_y)} cell. */
	CELL_TAKEN,
	/** The submitted layout has no sets — an empty replace would silently wipe the map, so it is refused. */
	EMPTY_LAYOUT,
	/** The submitted layout exceeds the maximum grid size ({@link LayoutCommand#MAX_SETS} sets). */
	LAYOUT_TOO_LARGE
}
