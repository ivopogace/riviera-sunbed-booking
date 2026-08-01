package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for an operator to read <strong>their own</strong> venue's per-set
 * availability states for one day (issue #207) — the state-aware counterpart of the public map's
 * {@code FREE}/{@code TAKEN} overlay, feeding the console's Daily-view tiles and the stats
 * strip's Walk-ins tile so an unpaid online hold is never mislabeled a walk-in. Hold type is
 * operator data: this read is what keeps it off the public tourist surface. Internal to the
 * {@code venue} module (REST-only caller), so it lives in {@code application}, not {@code api/}
 * (invariant #11), exactly like {@link ViewVenueProfile}.
 *
 * <p>Venue-scoped: the implementation verifies {@code operator} owns {@code venueId} before the
 * read (invariant #13, BOLA), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch — so
 * an operator can never read another venue's hold pattern. An empty {@link Optional} (venue
 * vanished after the ownership grant) maps to 404 in the controller.
 */
public interface ViewDailyAvailability {

	/**
	 * The held sets of the owner's venue on {@code date}, each with its state token, ordered by
	 * set id ({@code BOOKED_ONLINE} or {@code STAFF_MARKED}; a free set is absent) — or empty if
	 * the venue no longer exists (after asserting ownership).
	 *
	 * @param date the calendar day, a {@code LocalDate} in {@code Europe/Tirane} (invariant #6)
	 */
	Optional<List<SetDayState>> statesFor(OperatorId operator, VenueId venueId, LocalDate date);
}
