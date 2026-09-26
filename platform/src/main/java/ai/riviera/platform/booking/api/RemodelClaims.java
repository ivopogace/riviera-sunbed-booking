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
 * The published remodel port, composed with {@code venue}'s diff at the platform edge (ADR-0020):
 * what a layout save disturbing {@code disturbedSets} does to every live booking on them.
 * {@link #classify} is advisory — an unlocked snapshot shown before confirming — so {@link #commit}
 * re-derives it inside the caller's transaction, after {@code venue} has locked every set row of the
 * venue. Answers carry outcome kinds, never a booking status or code (invariant #7). Rules:
 * RESPONSIBILITIES.md §booking.
 */
public interface RemodelClaims {

	/**
	 * Every live booking on the given sets with its outcome, in (service date, booking id) allocation
	 * order — one free set serves one claim per day. Owner-asserted before any read (invariant #13); an
	 * empty set list answers an empty list without touching the database.
	 */
	List<RemodelClaim> classify(OperatorId operator, VenueId venueId, Collection<SetId> disturbedSets);

	/**
	 * Settle every live claim on the given sets inside the caller's transaction, owner-asserted first
	 * (invariant #13): {@code Stale} or {@code Unconfirmed} writes nothing; a lost candidate claim or an
	 * unmatched guarded transition throws to roll it all back. Rules: RESPONSIBILITIES.md §booking.
	 */
	RemodelCommit commit(OperatorId operator, VenueId venueId, Collection<SetId> disturbedSets, PreviewToken token,
			RefundConfirmation confirmation);

	/**
	 * The current per-refund cost to the venue, read through {@code booking.spi.VenueChangeFeeRate} so
	 * the operator sees it before confirming; a commit snapshots its charge onto the receipt, so this
	 * never re-prices one already written.
	 */
	VenueChangeFee venueChangeFee();
}
