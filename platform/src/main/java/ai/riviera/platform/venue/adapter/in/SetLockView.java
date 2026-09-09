package ai.riviera.platform.venue.adapter.in;

import java.time.LocalDate;

import ai.riviera.platform.venue.application.SetLock;

/**
 * One locked set on the wire of the owner's beach-map read: the set id, the earliest service day a
 * guest is still coming on ({@code bookedOn}) and the earliest hold dated today or later
 * ({@code heldOn}), each an ISO {@code YYYY-MM-DD} string (invariant #6) or {@code null} when that
 * arm does not hold — never both null. The dates are rendered here rather than left to the
 * serializer, so the format the client parses is pinned by this type.
 */
record SetLockView(long setId, String bookedOn, String heldOn) {

	static SetLockView of(SetLock lock) {
		return new SetLockView(lock.setId().value(), iso(lock.bookedOn()), iso(lock.heldOn()));
	}

	private static String iso(LocalDate date) {
		return date == null ? null : date.toString();
	}
}
