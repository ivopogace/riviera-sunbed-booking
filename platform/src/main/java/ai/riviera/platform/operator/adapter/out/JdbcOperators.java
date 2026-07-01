package ai.riviera.platform.operator.adapter.out;

import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.operator.application.Operators;
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

	private final JdbcClient jdbc;

	JdbcOperators(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<OperatorId> idByActiveUsername(String username) {
		return jdbc.sql("SELECT id FROM operator WHERE username = :username AND status = :active")
				.param("username", username)
				.param("active", OperatorStatus.ACTIVE.name())
				.query(Long.class)
				.optional()
				.map(OperatorId::new);
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
