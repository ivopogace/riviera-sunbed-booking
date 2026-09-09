package ai.riviera.platform.booking.api;

import java.util.Collection;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code booking} module's published <strong>remodel</strong> port (invariant #11): what a
 * layout save that disturbs {@code disturbedSets} would do to every live booking on them. Consumed
 * by the platform edge, which composes it with {@code venue}'s diff — {@code venue} may not depend
 * on {@code booking}, so the composition is the root's (ADR-0020).
 *
 * <p>A synchronous query, because the operator is shown the answer before confirming; and an
 * <strong>advisory</strong> one: it reads a snapshot under no lock, so the commit re-derives the
 * classification under its own locks. Which statuses count as live, the zone of each claim and
 * where it would move are this module's rules ({@code RemodelZones}, {@code MoveRanking}); the
 * answer carries outcome kinds, never a booking status or code.
 */
public interface RemodelClaims {

	/**
	 * Every live booking on the given sets with its outcome, ordered by service date then booking
	 * id — the order in which candidates were allocated, so one free set serves one claim per date.
	 * Owner-asserted: a non-owner is refused before any read (invariant #13). An empty set list
	 * answers an empty list without touching the database.
	 */
	List<RemodelClaim> classify(OperatorId operator, VenueId venueId, Collection<SetId> disturbedSets);
}
