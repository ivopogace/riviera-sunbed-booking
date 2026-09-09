package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.application.BlockedSet;

/**
 * One set a refused bulk save names, on the wire of the {@code 409 SETS_IN_USE} problem's
 * {@code sets} extension: the set id, its row label and position number, and the lock's two dates
 * in {@link SetLockView}'s ISO form ({@code YYYY-MM-DD} or {@code null}, never both null) — so
 * the editor can mark the cell exactly as the owner's beach-map read would.
 */
record BlockedSetView(long setId, String rowLabel, int positionNo, String bookedOn, String heldOn) {

	static BlockedSetView of(BlockedSet blocked) {
		SetLockView lock = SetLockView.of(blocked.lock());
		return new BlockedSetView(lock.setId(), blocked.set().placement().rowLabel(),
				blocked.set().placement().positionNo(), lock.bookedOn(), lock.heldOn());
	}
}
