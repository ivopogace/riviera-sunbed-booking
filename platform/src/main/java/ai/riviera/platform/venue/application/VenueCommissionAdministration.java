package ai.riviera.platform.venue.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Platform administration of venue commission rates (A7, epic #348) — the list every venue's rate and
 * the write that changes one. Deliberately a <strong>separate port</strong> from the venue-scoped
 * write use cases ({@link EditVenueProfile}, {@link EditBeachMap}) rather than extra methods on them,
 * for the reason {@link VenuePhotoModeration} was split from {@code VenuePhotos}: those ports promise
 * their writes assert per-venue ownership <em>first</em> (invariant #13), and an ownership-free method
 * hung off one would turn that promise into a per-method detail every caller has to re-read.
 *
 * <p><strong>The contract is the port's, not any one method's: every method here is ownership-free by
 * design.</strong> Naming the port for that posture is what lets the list and the write share it — an
 * admin looks at the platform's rates and then corrects one, one conversation with one actor and one
 * authorization posture.
 *
 * <p>The driving adapter is {@code AdminVenueCommissionController}, gated to the {@code ADMIN} role in
 * {@code SecurityConfig}: that role gate is the <strong>whole</strong> authorization for this port,
 * which is why nothing else may depend on it. An admin does not <em>own</em> a rate, so there is
 * nothing for object-level authorization to check — and the venue-scoped alternative would refuse
 * exactly the case this exists for. Note the asymmetry with the operator: the owner's profile
 * {@code PATCH} still cannot write the rate at all (O8 #177), which is why this surface had to exist
 * rather than the `PATCH` simply being widened — a venue does not get to set its own commission.
 *
 * <p><strong>Unlike {@link VenuePhotoModeration} this surface does not blur venue existence.</strong>
 * An unknown venue is reported as such, because venues are already enumerable through the anonymous
 * discovery read — there is no existence signal left to protect, and an admin correcting a rate needs
 * to know a mistyped id found nothing rather than silently succeeding.
 */
public interface VenueCommissionAdministration {

	/**
	 * Every venue with its live commission rate and payout currency, ordered by name then id —
	 * <strong>without any ownership check</strong>. Platform-wide by design: the admin owns none of
	 * these venues, and no other read carries commission across venues ({@code GET /api/venues} is the
	 * anonymous discovery read, the venue profile is owner-asserted, and {@code /api/venues/mine} is
	 * scoped to one operator), which is why an admin could not see the rates it is meant to correct.
	 */
	List<VenueCommissionView> venueCommissions();

	/**
	 * Set the venue's commission rate — <strong>without any ownership check</strong> — returning the
	 * updated view, or empty if no venue has that id (→ {@code 404}).
	 *
	 * <p>The change is <strong>forward-only</strong>, which is the whole of its interaction with
	 * invariant #9. It takes effect immediately for decisions being made now (the next accrual reads
	 * the live rate) and from the <em>next</em> service date for the reporting reads, so no figure for
	 * a day already sold changes and no existing payout-ledger entry is touched. The effective date is
	 * computed here, never supplied by the caller: there is deliberately no way to backdate a rate.
	 */
	Optional<VenueCommissionView> setCommission(VenueId venueId, CommissionRateCommand command);
}
