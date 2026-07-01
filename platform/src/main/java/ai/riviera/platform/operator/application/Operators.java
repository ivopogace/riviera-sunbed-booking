package ai.riviera.platform.operator.application;

import java.util.Optional;
import java.util.Set;

import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueRef;

/**
 * Driven (outbound) persistence port for the {@code operator} module — the operator accounts and
 * the operator↔venue ownership mapping. Internal to the module (not a published named interface);
 * implemented by {@code adapter/out}'s {@code JdbcOperators} (invariant #1 — JDBC only). A single
 * purposeful port for the whole module's storage, mirroring {@code venue.application.out.Venues}.
 */
public interface Operators {

	/** The id of the {@code ACTIVE} operator with this username, or empty (unknown/suspended). */
	Optional<OperatorId> idByActiveUsername(String username);

	/**
	 * Whether {@code operator} owns {@code venue} — true if the operator is flagged owns-all (the
	 * interim bootstrap operator) or an explicit {@code operator_venue} mapping row exists.
	 */
	boolean ownsVenue(OperatorId operator, VenueRef venue);

	/** The venues explicitly mapped to {@code operator} (excludes the owns-all short-circuit). */
	Set<VenueRef> ownedVenues(OperatorId operator);
}
