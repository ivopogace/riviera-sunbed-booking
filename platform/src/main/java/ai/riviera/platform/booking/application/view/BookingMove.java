package ai.riviera.platform.booking.application.view;

import java.time.Instant;

/**
 * The move a remodel made to a booking, as its guest reads it: the spot they were told before
 * (a snapshot — the set may since be retired or renumbered), the distance to the spot they hold now,
 * when it moved, and the free-exit deadline while it is still ahead ({@code null} once passed or the
 * window is CLOSED). The current spot is the detail's own {@code rowLabel}/{@code positionNo}.
 */
public record BookingMove(String fromRowLabel, int fromPositionNo, int rowsAway, int positionsAway,
		Instant movedAt, Instant freeExitUntil) {
}
