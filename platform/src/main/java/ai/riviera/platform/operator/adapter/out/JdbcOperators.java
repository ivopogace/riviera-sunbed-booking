package ai.riviera.platform.operator.adapter.out;

import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.operator.application.Operators;
import ai.riviera.platform.operator.api.OperatorCredential;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueRef;
import ai.riviera.platform.operator.domain.OperatorStatus;

/**
 * JDBC adapter for the {@code operator} module's {@link Operators} port (ADR-0007 {@code adapter/out}).
 * Explicit SQL via {@link JdbcClient} in text blocks, named params, package-private (invariant #1,
 * mirroring {@code JdbcCustomerDirectory}). The {@code ACTIVE} token is bound from
 * {@link OperatorStatus} rather than inlined (invariant #6a).
 */
@Repository
class JdbcOperators implements Operators {

	/** SQL named-param / column key for the operator username (named, not duplicated — invariant #6a). */
	private static final String USERNAME = "username";

	private final JdbcClient jdbc;

	JdbcOperators(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<OperatorId> idByActiveUsername(String username) {
		return jdbc.sql("SELECT id FROM operator WHERE username = :username AND status = :active")
				.param(USERNAME, username)
				.param("active", OperatorStatus.ACTIVE.name())
				.query(Long.class)
				.optional()
				.map(OperatorId::new);
	}

	@Override
	public Optional<OperatorCredential> credentialByUsername(String username) {
		// Any status — the edge builds a disabled principal for a non-ACTIVE account so the framework
		// rejects it before the password check. active is derived from the status token (invariant #6a).
		return jdbc.sql("SELECT username, password_hash, status FROM operator WHERE username = :username")
				.param(USERNAME, username)
				.query((rs, rowNum) -> new OperatorCredential(
						rs.getString(USERNAME),
						rs.getString("password_hash"),
						OperatorStatus.ACTIVE.name().equals(rs.getString("status"))))
				.optional();
	}

	@Override
	public OperatorId insert(String username, String passwordHash) {
		long id = jdbc.sql("""
				INSERT INTO operator (username, status, owns_all_venues, password_hash)
				VALUES (:username, :active, FALSE, :hash) RETURNING id
				""")
				.param(USERNAME, username)
				.param("active", OperatorStatus.ACTIVE.name())
				.param("hash", passwordHash)
				.query(Long.class)
				.single();
		return new OperatorId(id);
	}

	@Override
	public int updatePassword(String username, String passwordHash) {
		return jdbc.sql("UPDATE operator SET password_hash = :hash WHERE username = :username")
				.param("hash", passwordHash)
				.param(USERNAME, username)
				.update();
	}

	@Override
	public boolean ownsVenue(OperatorId operator, VenueRef venue) {
		// One statement: owns-all short-circuit OR an explicit mapping row. The row lookup uses the
		// operator_venue PK (venue_id) + the operator FK index, so it is an index probe either way.
		return jdbc.sql("""
				SELECT EXISTS (
				    SELECT 1 FROM operator o
				    WHERE o.id = :operator
				      AND (o.owns_all_venues
				           OR EXISTS (SELECT 1 FROM operator_venue ov
				                      WHERE ov.operator_id = o.id AND ov.venue_id = :venue))
				)
				""")
				.param("operator", operator.value())
				.param("venue", venue.value())
				.query(Boolean.class)
				.single();
	}

	@Override
	public Set<VenueRef> ownedVenues(OperatorId operator) {
		return jdbc.sql("SELECT venue_id FROM operator_venue WHERE operator_id = :operator ORDER BY venue_id")
				.param("operator", operator.value())
				.query(Long.class)
				.list().stream()
				.map(VenueRef::new)
				.collect(Collectors.toCollection(LinkedHashSet::new));
	}
}
