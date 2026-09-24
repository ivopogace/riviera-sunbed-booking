package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The check-in outcomes — a closed set the adapter switches over exhaustively. Expected,
 * caller-handled flow (a lost race, a wrong day, an unknown code), so values rather than
 * exceptions; none carries the booking code (invariant #7).
 */
public sealed interface CheckInResult {

	/** The scan won tonight's guarded stamp; {@code bookingDate} is the stay's first night. */
	record CheckedIn(SetId setId, LocalDate bookingDate) implements CheckInResult {
	}

	/** Tonight already attended, or the stay {@code COMPLETED} — what a second scan of the same code gets. */
	record AlreadyCheckedIn(LocalDate bookingDate) implements CheckInResult {
	}

	/** Live or swept, but today is not one of its unattended nights — refused without a write. */
	record WrongServiceDate(LocalDate bookingDate) implements CheckInResult {
	}

	/** Unknown at this venue — covers unknown codes, foreign venues' codes and dead lifecycles alike. */
	record NotFound() implements CheckInResult {
	}
}
