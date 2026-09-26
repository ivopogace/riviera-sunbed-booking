package ai.riviera.platform.availability.application;

import java.time.LocalDate;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Staff tap-to-mark: an operator marks a free set taken by a walk-in ({@code STAFF_MARKED}) and
 * later releases it — the second writer onto the {@code (set, date)} row, behind the same
 * {@code UNIQUE(set_id, booking_date)} guard as the online claim, so a mark and an online booking
 * never both hold a day (invariant #2). Module-internal, not {@code api/} (invariant #11). Ownership
 * (invariant #13) is asserted on {@code venue} before any set lookup ({@code 403}), and a set not on
 * that venue answers as a missing one, so neither reply tells a non-owner that a set id exists.
 */
public interface StaffAvailability {

	/**
	 * Marks {@code (setId, date)} for a walk-in; pool-agnostic, so marking an online-pool set takes it
	 * off online sale. A held day, a date before today in {@code Europe/Tirane} (#6) or a set not on
	 * {@code venue} ({@code NO_SUCH_SET}) is an outcome; a {@code venue} the operator does not own is 403.
	 */
	MarkOutcome mark(OperatorId operator, VenueId venue, SetId setId, LocalDate date);

	/**
	 * Deletes only a {@code STAFF_MARKED} row, never a {@code BOOKED_ONLINE} one (invariant #2): a free
	 * or online-held day, or a set not on {@code venue}, yields {@code NOT_MARKED}, a safe no-op. A
	 * {@code venue} the operator does not own is 403.
	 */
	ReleaseOutcome release(OperatorId operator, VenueId venue, SetId setId, LocalDate date);
}
