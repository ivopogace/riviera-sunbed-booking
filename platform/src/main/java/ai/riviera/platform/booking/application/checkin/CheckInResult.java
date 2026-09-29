package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The check-in outcomes — a closed set the adapter switches over exhaustively. Expected,
 * caller-handled flow (a lost race, a wrong day, an unknown code), so values rather than
 * exceptions; none carries the booking code (invariant #7).
 */
public sealed interface CheckInResult {

	/** The scan won today's guarded stamp; {@code bookingDate} is the first day of the booking stamped — a stay's stretch of today. */
	record CheckedIn(SetId setId, LocalDate bookingDate) implements CheckInResult {
	}

	/**
	 * Today already attended, or the stay {@code COMPLETED} — what a second scan of the same code gets;
	 * {@code setId} is today's set, so staff can still point the guest to it on a move day.
	 */
	record AlreadyCheckedIn(LocalDate bookingDate, SetId setId) implements CheckInResult {
	}

	/** Live or swept, but today is not one of its unattended service days — refused without a write. */
	record WrongServiceDate(LocalDate bookingDate) implements CheckInResult {
	}

	/** Today was refunded and the set is still the guest's (a weather day, ADR-0026 §3); the day is not stamped. */
	record DayRefunded(LocalDate bookingDate, SetId setId) implements CheckInResult {
	}

	/** Today was refunded by the venue and its spot released (ADR-0027 §5): another guest may hold it; nothing is stamped. */
	record DayReleased(LocalDate bookingDate, SetId setId) implements CheckInResult {
	}

	/** Unknown at this venue — covers unknown codes, foreign venues' codes and dead lifecycles alike. */
	record NotFound() implements CheckInResult {
	}
}
