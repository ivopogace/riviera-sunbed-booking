package ai.riviera.platform.booking.api;

import java.util.Collection;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.booking.vocabulary.VenueChangeFee;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code booking} module's published <strong>remodel</strong> port (invariant #11): what a
 * layout save that disturbs {@code disturbedSets} would do to every live booking on them. Consumed
 * by the platform edge, which composes it with {@code venue}'s diff — {@code venue} may not depend
 * on {@code booking}, so the composition is the root's (ADR-0020).
 *
 * <p>{@link #classify} is a synchronous query, because the operator is shown the answer before
 * confirming; and an <strong>advisory</strong> one: it reads a snapshot under no lock, so
 * {@link #commit} re-derives the classification inside the caller's transaction — the edge calls it
 * from inside {@code venue}'s layout write, after every set row of the venue is locked — before it
 * moves anything. Which statuses count as live, the zone of each claim and
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

	/**
	 * Apply the remodel to every live booking on the given sets, inside the caller's transaction:
	 * re-classify, check {@code token} still covers the answer, then act on each claim — a move claims
	 * its candidate's {@code (set, date)} row before releasing the old one (invariant #2) and re-seats
	 * the booking with a moved-at stamp; a confirmed claim with nowhere to go is cancelled with reason
	 * {@code VENUE_CHANGE} and its full amount as the refund; an unpaid one is released and a pending
	 * request declined, neither involving money. Every leg frees its {@code (set, date)} row, writes a
	 * receipt line and publishes the module's existing fact for it. Nothing here talks to Stripe: the
	 * refunds drain after commit on the module's own listener. Owner-asserted first (invariant #13).
	 *
	 * <p>A token that does not cover the fresh answer is {@code Stale}; a claim that pins its set is
	 * {@code Refused}; a picture that refunds guests without a matching typed count and a reason is
	 * {@code Unconfirmed}. None of the three writes anything. A candidate whose claim is not won, or a
	 * guarded transition that matches no row, throws so the caller's whole transaction rolls back. The
	 * caller's locks are on the venue's <em>sets</em>, not on the booking rows, so a booking that
	 * changes status inside the commit window — a payment webhook, a guest cancel, an expiry sweep —
	 * lands here rather than in one of the three refusals; the rollback leaves nothing half-applied,
	 * and the operator's next save classifies against the new fact.
	 */
	RemodelCommit commit(OperatorId operator, VenueId venueId, Collection<SetId> disturbedSets, PreviewToken token,
			RefundConfirmation confirmation);

	/**
	 * What each refund in a picture would cost the venue — the current rate, so the operator sees the
	 * price of the change before confirming it. Decided by {@code payout} and read through
	 * {@code booking.spi.VenueChangeFeeRate}; a commit snapshots what it charged onto its receipt, so
	 * this answer never re-prices one already written.
	 */
	VenueChangeFee venueChangeFee();
}
