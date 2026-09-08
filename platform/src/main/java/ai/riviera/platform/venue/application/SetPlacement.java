package ai.riviera.platform.venue.application;

/**
 * Where a stored set sits — the locked row's current position, returned by {@link Venues#lockSet}
 * so a per-set edit is judged against what is actually stored rather than against the caller's
 * assumptions.
 */
public record SetPlacement(String rowLabel, int positionNo, int gridX, int gridY) {

	/**
	 * Whether applying {@code command} would move this set — the only edit a hold or booking can be
	 * harmed by, because a reposition silently re-seats a guest who was told this row and number.
	 * Pool, price and tier are excluded on purpose: a booking's charge is snapshotted at reserve time,
	 * and the pool decides only whether a <em>new</em> online booking may claim the set (invariant #3
	 * is a reserve-time rule) — an existing hold stays on its {@code (set, date)} row whatever the
	 * pool now says. Rationale: RESPONSIBILITIES.md §venue.
	 */
	public boolean disturbedBy(SetCommand command) {
		return !rowLabel.equals(command.rowLabel())
				|| positionNo != command.positionNo()
				|| gridX != command.gridX()
				|| gridY != command.gridY();
	}
}
