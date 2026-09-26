package ai.riviera.platform.availability.api;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

import ai.riviera.platform.availability.vocabulary.ClaimOutcome;

/**
 * {@code availability}'s published command port (invariant #11) for online claims on the
 * {@code (set, date)} source of truth; it hides the pool check (invariant #3) and the atomic claim
 * against {@code UNIQUE(set_id, booking_date)} (invariant #2). A synchronous command, never an event:
 * {@code booking} needs the answer inside its transaction to proceed or reject. {@code availability}
 * stays the table's only writer.
 */
public interface AvailabilityClaim {

	/**
	 * Atomically claims {@code (setId, bookingDate)}, a {@code Europe/Tirane} day, for an online
	 * booking: at most one caller wins (invariant #2), only {@code ONLINE}-pool sets (invariant #3).
	 * Never throws on a lost race or an unclaimable set; the {@link ClaimOutcome} says why.
	 */
	ClaimOutcome claim(SetId setId, LocalDate bookingDate);

	/**
	 * Frees the {@code BOOKED_ONLINE} row for {@code (setId, bookingDate)} so it is re-claimable
	 * (invariant #2). Never touches a staff-marked row; a no-op when no online claim holds the day.
	 */
	void release(SetId setId, LocalDate bookingDate);
}
