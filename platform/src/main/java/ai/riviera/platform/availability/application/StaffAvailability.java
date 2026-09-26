package ai.riviera.platform.availability.application;

import java.time.LocalDate;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Staff tap-to-mark: an operator marks a free set taken by a walk-in ({@code STAFF_MARKED}) and
 * later releases it — the second writer onto the {@code (set, date)} row, behind the same
 * {@code UNIQUE(set_id, booking_date)} guard as the online claim, so a mark and an online booking
 * never both hold a day (invariant #2). Module-internal, not {@code api/} (invariant #11). Ownership
 * (invariant #13) is asserted on the venue derived from {@code setId}, never the path
 * {@code venueId}, so a spoofed URL cannot reach another venue's set ({@code 403}).
 */
public interface StaffAvailability {

	/**
	 * Marks {@code (setId, date)} for a walk-in. Pool-agnostic by design: marking an online-pool set
	 * takes it off online sale. A held day, or one before today in {@code Europe/Tirane} (#6), is an
	 * outcome; a set the {@code operator} does not own is 403.
	 */
	MarkOutcome mark(OperatorId operator, SetId setId, LocalDate date);

	/**
	 * Deletes only a {@code STAFF_MARKED} row, never a {@code BOOKED_ONLINE} one (invariant #2): a
	 * free or online-held day yields {@code NOT_MARKED}, a safe no-op. A set the {@code operator} does
	 * not own is 403.
	 */
	ReleaseOutcome release(OperatorId operator, SetId setId, LocalDate date);
}
