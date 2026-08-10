package ai.riviera.platform.venue.application;

/**
 * Where a stored set sits and which pool it draws from — the layout facts a claim depends on.
 * Returned by {@link Venues#lockSet} as the locked row's current state, so a per-set edit can be
 * judged against what is actually stored rather than against the caller's assumptions.
 */
public record SetPlacement(String pool, String rowLabel, int positionNo, int gridX, int gridY) {

	/**
	 * Whether applying {@code command} would move this set or change which pool it draws from —
	 * the only edits a hold or booking can be harmed by. A repool strands an online booking on
	 * walk-in inventory (invariant #3); a reposition silently re-seats a guest who was told this
	 * row and number. Price and tier are excluded on purpose: a booking's charge is snapshotted at
	 * reserve time, which is why {@code repriceRow} is allowed on a claimed venue too.
	 */
	public boolean disturbedBy(SetCommand command) {
		return !pool.equals(command.pool())
				|| !rowLabel.equals(command.rowLabel())
				|| positionNo != command.positionNo()
				|| gridX != command.gridX()
				|| gridY != command.gridY();
	}
}
