package ai.riviera.platform.operator.adapter.out;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.operator.application.Operators;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorRegistrationOutcome;
import ai.riviera.platform.operator.vocabulary.PendingOperator;
import ai.riviera.platform.operator.vocabulary.VenueRef;
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
		// rejects it before the password check. active is derived from the status token (invariant #6a);
		// is_admin drives the edge's ROLE_ADMIN grant (#115).
		return jdbc.sql("SELECT username, password_hash, status, is_admin FROM operator WHERE username = :username")
				.param(USERNAME, username)
				.query((rs, rowNum) -> new OperatorCredential(
						rs.getString(USERNAME),
						rs.getString("password_hash"),
						OperatorStatus.ACTIVE.name().equals(rs.getString("status")),
						rs.getBoolean("is_admin")))
				.optional();
	}

	@Override
	public OperatorId insert(String username, String passwordHash) {
		long id = jdbc.sql("""
				INSERT INTO operator (username, status, password_hash)
				VALUES (:username, :active, :hash) RETURNING id
				""")
				.param(USERNAME, username)
				.param("active", OperatorStatus.ACTIVE.name())
				.param("hash", passwordHash)
				.query(Long.class)
				.single();
		return new OperatorId(id);
	}

	@Override
	public OperatorRegistrationOutcome insertPending(String username, String passwordHash, String contactEmail) {
		// ON CONFLICT DO NOTHING → non-enumerating + idempotent (D-8): a taken username writes nothing
		// and RETURNING yields no row (empty → AlreadyRegistered), and an existing hash is never
		// overwritten. Status PENDING + is_admin FALSE — a self-registered operator cannot log in until
		// an admin approves it, and is never an admin. PENDING is bound, not inlined (invariant #6a).
		return jdbc.sql("""
				INSERT INTO operator (username, status, is_admin, password_hash, contact_email)
				VALUES (:username, :pending, FALSE, :hash, :email)
				ON CONFLICT (username) DO NOTHING
				RETURNING id
				""")
				.param(USERNAME, username)
				.param("pending", OperatorStatus.PENDING.name())
				.param("hash", passwordHash)
				.param("email", contactEmail)
				.query(Long.class)
				.optional()
				.<OperatorRegistrationOutcome>map(id -> new OperatorRegistrationOutcome.Registered(new OperatorId(id)))
				.orElseGet(OperatorRegistrationOutcome.AlreadyRegistered::new);
	}

	@Override
	public int updatePassword(String username, String passwordHash) {
		return jdbc.sql("UPDATE operator SET password_hash = :hash WHERE username = :username")
				.param("hash", passwordHash)
				.param(USERNAME, username)
				.update();
	}

	@Override
	public List<PendingOperator> pendingOperators() {
		return jdbc.sql("""
				SELECT id, username, contact_email, created_at FROM operator
				WHERE status = :pending ORDER BY created_at, id
				""")
				.param("pending", OperatorStatus.PENDING.name())
				.query((rs, rowNum) -> new PendingOperator(
						new OperatorId(rs.getLong("id")),
						rs.getString(USERNAME),
						rs.getString("contact_email"),
						rs.getObject("created_at", java.time.OffsetDateTime.class).toInstant()))
				.list();
	}

	@Override
	public ApprovalOutcome activate(OperatorId operatorId) {
		return transitionFromPending(operatorId, OperatorStatus.ACTIVE, ApprovalOutcome.APPROVED);
	}

	@Override
	public ApprovalOutcome rejectPending(OperatorId operatorId) {
		return transitionFromPending(operatorId, OperatorStatus.REJECTED, ApprovalOutcome.REJECTED);
	}

	/**
	 * Move a PENDING operator to {@code target}, returning {@code success} on a hit. A miss is classified
	 * by an existence read so the edge can distinguish {@code NOT_PENDING} (already decided) from
	 * {@code NO_SUCH_OPERATOR} (unknown id) — the conditional {@code WHERE status = PENDING} is the
	 * single source of truth, so two concurrent approvals cannot both win.
	 */
	private ApprovalOutcome transitionFromPending(OperatorId operatorId, OperatorStatus target,
			ApprovalOutcome success) {
		int rows = jdbc.sql("UPDATE operator SET status = :target WHERE id = :id AND status = :pending")
				.param("target", target.name())
				.param("id", operatorId.value())
				.param("pending", OperatorStatus.PENDING.name())
				.update();
		if (rows == 1) {
			return success;
		}
		boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM operator WHERE id = :id)")
				.param("id", operatorId.value())
				.query(Boolean.class)
				.single();
		return exists ? ApprovalOutcome.NOT_PENDING : ApprovalOutcome.NO_SUCH_OPERATOR;
	}

	@Override
	public boolean ownsVenue(OperatorId operator, VenueRef venue) {
		// Ownership is strictly the explicit operator_venue mapping (owns-all retired in #115). The
		// lookup uses the operator_venue PK (venue_id) + the operator FK index, so it is an index probe.
		return jdbc.sql("""
				SELECT EXISTS (
				    SELECT 1 FROM operator_venue ov
				    WHERE ov.operator_id = :operator AND ov.venue_id = :venue
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

	@Override
	public void assignOwner(OperatorId operator, VenueRef venue) {
		// One owner per venue (operator_venue.venue_id is the PK) — a plain INSERT so a second owner
		// for the same venue surfaces as a constraint violation rather than silently no-op'ing.
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:venue, :operator)")
				.param("venue", venue.value())
				.param("operator", operator.value())
				.update();
	}
}
