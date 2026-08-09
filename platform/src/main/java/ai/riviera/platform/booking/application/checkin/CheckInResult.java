package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The check-in outcomes — a closed set the adapter switches over exhaustively. Expected,
 * caller-handled flow (a lost race, a wrong day, an unknown code), so values rather than
 * exceptions; none carries the booking code (invariant #7).
 */
public sealed interface CheckInResult {

	/** The scan won the guarded transition: the booking is now {@code COMPLETED}. */
	record CheckedIn(SetId setId, LocalDate bookingDate) implements CheckInResult {
	}

	/** Already {@code COMPLETED} — the single-use answer a second scan of the same code gets. */
	record AlreadyCheckedIn(LocalDate bookingDate) implements CheckInResult {
	}

	/** Confirmed, but for {@code bookingDate}, not today — refused without transitioning. */
	record WrongServiceDate(LocalDate bookingDate) implements CheckInResult {
	}

	/** Unknown at this venue — covers unknown codes, foreign venues' codes and dead lifecycles alike. */
	record NotFound() implements CheckInResult {
	}
}
