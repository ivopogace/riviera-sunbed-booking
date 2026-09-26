package ai.riviera.platform.venue.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Platform administration of commission rates: every method is ownership-free by design, hence a port
 * apart from the ownership-first venue writes (invariant #13). The {@code ADMIN} role gate on
 * {@code AdminVenueCommissionController} is the whole authorization, so nothing else may depend on it.
 * The owner's profile {@code PATCH} can never write the rate. Unlike {@link VenuePhotoModeration}, an
 * unknown venue is reported as such: venues are already enumerable. Rationale: RESPONSIBILITIES.md §venue.
 */
public interface VenueCommissionAdministration {

	/**
	 * Every venue with its live rate and payout currency, ordered by name then id, with no ownership check —
	 * the only read that carries commission across venues.
	 */
	List<VenueCommissionView> venueCommissions();

	/**
	 * Set the rate with no ownership check, returning the updated view or empty (→ {@code 404}). Forward-only
	 * (invariant #9): live at once for decisions, scheduled from the current Europe/Tirane service date for
	 * reports, never backdated — so no ledger entry or past day's figure changes.
	 */
	Optional<VenueCommissionView> setCommission(VenueId venueId, CommissionRateCommand command);
}
