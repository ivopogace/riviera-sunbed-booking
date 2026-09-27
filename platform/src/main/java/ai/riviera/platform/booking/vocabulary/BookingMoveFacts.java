package ai.riviera.platform.booking.vocabulary;

import java.time.Instant;
import java.time.LocalDate;

/**
 * What a remodel did to one booking, as the mail and the guest's view tell it: the spot it left and the one
 * it holds (labels snapshotted at the move; the old set may since be retired or renumbered), the distance,
 * the service day, the instant of the move, whether it is a stay's stretch, and the free-exit deadline the
 * move earned ({@code CancellationPolicy}'s rule, capped where the stay's cancellation closes; {@code null}
 * when the stay had already begun). No code (invariant #7): the reader resolves it by id.
 */
public record BookingMoveFacts(LocalDate bookingDate, String fromRowLabel, int fromPositionNo,
		String toRowLabel, int toPositionNo, int rowsAway, int positionsAway, Instant movedAt,
		Instant freeExitUntil, boolean stretch) {
}
