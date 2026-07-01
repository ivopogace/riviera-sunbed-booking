package ai.riviera.platform.availability.application;

import java.time.LocalDate;

import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.venue.api.SetId;

/**
 * The staff tap-to-mark use case (U8, issue #10) — the second writer onto the
 * {@code (set, date)} source of truth (invariant #2), after the online
 * {@link ai.riviera.platform.availability.api.AvailabilityClaim}. A venue operator marks a
 * free set taken by a walk-in ({@code STAFF_MARKED}) and later releases it. Both directions
 * go through the same {@code UNIQUE(set_id, booking_date)} guard as the online claim, so a
 * staff mark and an online booking can never both hold the same {@code (set, date)}.
 *
 * <p>Internal driving port ({@code application.in}), <strong>not</strong> cross-module
 * {@code api/} (invariant #11): the only caller is this module's own REST adapter
 * ({@code StaffAvailabilityController}). Returns typed outcomes rather than throwing — a lost
 * race or a guarded release is normal, expected flow.
 *
 * <p><strong>Per-venue authorization (invariant #13):</strong> a set is globally unique, so the
 * owning venue is derived from the {@code setId} (via {@code venue.api.VenueCatalog}), never the
 * decorative path {@code venueId} — an operator cannot spoof the URL to reach another venue's set.
 * The implementation asserts {@code operator} owns that venue and returns {@code 403} on a mismatch.
 */
public interface StaffAvailability {

	/**
	 * Mark {@code (setId, date)} as {@code STAFF_MARKED} for a walk-in. Pool-agnostic by design
	 * (issue #10) — any <em>free</em> set may be marked, including an online-pool one, which is
	 * precisely the collision-relevant case: once marked it is removed from online availability.
	 * The date must not be before today in {@code Europe/Tirane} (invariant #6); a set already
	 * held by either channel loses the claim. Rejects a set the {@code operator} does not own (403).
	 *
	 * @param operator the authenticated operator (must own the set's venue)
	 * @param setId    the set to mark
	 * @param date     the calendar day (a {@code LocalDate} in {@code Europe/Tirane})
	 * @return why the mark succeeded or failed
	 */
	MarkOutcome mark(OperatorId operator, SetId setId, LocalDate date);

	/**
	 * Release a previously staff-marked {@code (setId, date)} — deletes <strong>only</strong> a
	 * {@code STAFF_MARKED} row, never an online booking's {@code BOOKED_ONLINE} row (invariant #2).
	 * Tapping a set that is free or online-held yields {@code NOT_MARKED}, a safe no-op. Rejects a
	 * set the {@code operator} does not own (403).
	 *
	 * @param operator the authenticated operator (must own the set's venue)
	 * @param setId    the set to release
	 * @param date     the calendar day (a {@code LocalDate} in {@code Europe/Tirane})
	 * @return whether a staff mark was released
	 */
	ReleaseOutcome release(OperatorId operator, SetId setId, LocalDate date);
}
