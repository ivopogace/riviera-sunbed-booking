package ai.riviera.platform.operator.application;

import java.util.Optional;
import java.util.Set;

import ai.riviera.platform.operator.api.OperatorCredential;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueRef;

/**
 * Driven (outbound) persistence port for the {@code operator} module — the operator accounts (incl.
 * their stored credential, #74) and the operator↔venue ownership mapping. Internal to the module (not
 * a published named interface); implemented by {@code adapter/out}'s {@code JdbcOperators} (invariant
 * #1 — JDBC only). A single purposeful port for the whole module's storage, mirroring
 * {@code venue.application.out.Venues}.
 */
public interface Operators {

	/** The id of the {@code ACTIVE} operator with this username, or empty (unknown/suspended). */
	Optional<OperatorId> idByActiveUsername(String username);

	/** The stored credential of the operator with this username (any status), or empty if unknown. */
	Optional<OperatorCredential> credentialByUsername(String username);

	/**
	 * Insert a new {@code ACTIVE}, not-owns-all operator with this username + pre-encoded credential
	 * hash; returns the generated id. Propagates the username unique-constraint violation on a clash.
	 */
	OperatorId insert(String username, String passwordHash);

	/** Update the stored credential of the operator with this username; returns rows affected. */
	int updatePassword(String username, String passwordHash);

	/**
	 * Whether {@code operator} owns {@code venue} — true if the operator is flagged owns-all (the
	 * interim bootstrap operator) or an explicit {@code operator_venue} mapping row exists.
	 */
	boolean ownsVenue(OperatorId operator, VenueRef venue);

	/** The venues explicitly mapped to {@code operator} (excludes the owns-all short-circuit). */
	Set<VenueRef> ownedVenues(OperatorId operator);
}
