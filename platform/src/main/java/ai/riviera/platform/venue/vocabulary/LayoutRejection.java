package ai.riviera.platform.venue.vocabulary;

/**
 * Why a bulk beach-map save was rejected without naming a set — the closed set of expected,
 * caller-handled failures of the bulk save and the remodel commit besides the refusal that names
 * the sets in use. Returned as a value, not thrown
 * (riviera-java-conventions: typed outcomes). Each carries its {@link Fault} class and the one
 * {@code detail} sentence every route answering it sends, so the bulk save and the remodel commit
 * cannot drift: {@code NOT_FOUND}→404, {@code CONFLICT}→409, {@code INVALID}→400.
 */
public enum LayoutRejection {

	/** No venue has the given id. */
	NO_SUCH_VENUE(Fault.NOT_FOUND, "No such venue."),
	/**
	 * The venue's {@code set_version} was bumped by another writer (a concurrent save or reprice) since
	 * the tab loaded the map, so the save is rejected rather than clobbering the current layout
	 * (optimistic-concurrency loss). The tab reloads the latest map and re-applies. Maps to 409
	 * {@code STALE_WRITE}.
	 */
	STALE_WRITE(Fault.CONFLICT, "This venue's sets have changed since the version this request carries."),
	/** Two submitted cells share the same {@code (row_label, position_no)} slot. */
	DUPLICATE_POSITION(Fault.CONFLICT, "Two sets share the same row and position."),
	/** Two submitted cells share the same {@code (grid_x, grid_y)} cell. */
	CELL_TAKEN(Fault.CONFLICT, "Two sets occupy the same grid cell."),
	/**
	 * One submitted {@code rowLabel} appears under two distinct {@code gridY} values, so two physical
	 * rows would share a name. The replace-path twin of {@code SetRejection.ROW_NAME_TAKEN}, caught
	 * within the batch: gap-cell position numbering can keep every {@code (row_label, position_no)}
	 * pair unique, which the database accepts — but the tourist map, the price rail and the pricing
	 * tab all group sets by label, so the two rows would silently read as one. Maps to 409
	 * {@code ROW_NAME_TAKEN}.
	 */
	ROW_NAME_TAKEN(Fault.CONFLICT, "Two rows in this layout share the same name."),
	/** The submitted layout has no sets — an empty save would silently wipe the map, so it is refused. */
	EMPTY_LAYOUT(Fault.INVALID, "A layout must have at least one set."),
	/** The submitted layout exceeds the maximum grid size ({@link LayoutCommand#MAX_SETS} sets). */
	LAYOUT_TOO_LARGE(Fault.INVALID, "The layout exceeds the maximum grid size.");

	/** The class of failure, which is what decides the HTTP status a route answers with. */
	public enum Fault {
		NOT_FOUND, CONFLICT, INVALID
	}

	private final Fault fault;
	private final String detail;

	LayoutRejection(Fault fault, String detail) {
		this.fault = fault;
		this.detail = detail;
	}

	public Fault fault() {
		return fault;
	}

	/** The problem {@code detail} sentence: the condition, never the remedy. */
	public String detail() {
		return detail;
	}
}
