package ai.riviera.platform.booking.application.checkin;

import java.time.LocalTime;

/**
 * The move-reminder sweep: the evening before a stitched stay's move (design D13), announce it once so
 * {@code notification} can mail the guest tomorrow's set. Driven by a scheduled adapter; the send hour
 * is passed in so the application layer holds no configuration type. Idempotent and safe to run
 * concurrently: the guarded stamp is the exactly-once primitive.
 */
public interface RemindStayMoves {

	/**
	 * From {@code sendFrom} ({@code Europe/Tirane}, invariant #6) until midnight, publishes
	 * {@code StayMoveDue} for every not-yet-reminded move happening tomorrow; returns how many. Before
	 * the hour, and for a move day already begun, nothing.
	 */
	int sweep(LocalTime sendFrom);
}
