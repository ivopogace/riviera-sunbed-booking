package ai.riviera.platform.booking.vocabulary;

import java.time.Instant;
import java.time.LocalDate;

/**
 * What a remodel did to one booking, as the mail and the guest's view tell it: the spot it left and
 * the spot it now holds — both as labels snapshotted when it moved, since the old set may since have
 * been retired or renumbered — the distance in rows and positions, the service day, the instant of
 * the move and the free-exit deadline the move earned ({@code CancellationPolicy}'s rule, so a later
 * read gives the mail's own date). No code (invariant #7): the reader resolves it by id.
 */
public record BookingMoveFacts(LocalDate bookingDate, String fromRowLabel, int fromPositionNo,
		String toRowLabel, int toPositionNo, int rowsAway, int positionsAway, Instant movedAt,
		Instant freeExitUntil) {
}
