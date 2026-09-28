package ai.riviera.platform.venue.adapter.in;

import java.time.LocalDate;

import ai.riviera.platform.venue.application.SetLock;
import ai.riviera.platform.venue.vocabulary.BookedSpan;

/**
 * One locked set on the wire of the owner's beach-map read: the set id, the span its live bookings
 * hold ({@code bookedOn} to {@code bookedUntil}) and the earliest hold dated today or later
 * ({@code heldOn}), each an ISO {@code YYYY-MM-DD} string (invariant #6) or {@code null} when that
 * arm does not hold — never both arms null. The dates are rendered here rather than left to the
 * serializer, so the format the client parses is pinned by this type.
 */
record SetLockView(long setId, String bookedOn, String bookedUntil, String heldOn) {

	static SetLockView of(SetLock lock) {
		BookedSpan booked = lock.booked();
		return new SetLockView(lock.setId().value(), iso(booked == null ? null : booked.firstDay()),
				iso(booked == null ? null : booked.lastDay()), iso(lock.heldOn()));
	}

	private static String iso(LocalDate date) {
		return date == null ? null : date.toString();
	}
}
