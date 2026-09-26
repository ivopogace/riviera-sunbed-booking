package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving port for an operator to read their own venue's per-set availability states for one day:
 * the state-aware counterpart of the public {@code FREE}/{@code TAKEN} overlay, for the console's
 * Daily view and Walk-ins tile, so an unpaid online hold is never mislabeled a walk-in. Hold type
 * is operator data, kept off the public surface. Internal: not in {@code api/} (invariant #11).
 * Ownership first (invariant #13): {@code NotVenueOwnerException} → 403; an empty
 * {@link Optional} (venue vanished after the grant) → 404.
 */
public interface ViewDailyAvailability {

	/**
	 * The held sets of the owner's venue on {@code date} (a {@code Europe/Tirane} day, invariant #6),
	 * by set id, each with its token ({@code BOOKED_ONLINE} or {@code STAFF_MARKED}; a free set is
	 * absent) — or empty if the venue does not exist (after asserting ownership).
	 */
	Optional<List<SetDayState>> statesFor(OperatorId operator, VenueId venueId, LocalDate date);
}
