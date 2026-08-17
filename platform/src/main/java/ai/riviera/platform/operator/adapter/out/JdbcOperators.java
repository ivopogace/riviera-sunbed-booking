package ai.riviera.platform.operator.adapter.out;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.operator.application.Operators;
import ai.riviera.platform.operator.vocabulary.OperatorAccount;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;
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
	/** SQL named-param key bound to the {@code PENDING} status token (named, not duplicated — #6a / S1192). */
	private static final String PENDING_PARAM = "pending";
	/** SQL named-param key bound to the {@code ACTIVE} status token (named, not duplicated — #6a / S1192). */
	private static final String ACTIVE_PARAM = "active";
	/** SQL named-param key bound to the {@code SUSPENDED} status token (invariant #6a). */
	private static final String SUSPENDED_PARAM = "suspended";
	/** SQL named-param key bound to an operator id in the ownership queries (named, not duplicated). */
	private static final String OPERATOR_PARAM = "operator";
	/** SQL named-param key bound to a venue id in the ownership/visibility queries (S1192). */
	private static final String VENUE_PARAM = "venue";
	/** SQL named-param key for an operator's primary key in the lifecycle statements (S1192). */
	private static final String ID_PARAM = "id";
	/** SQL named-param key for the status a lifecycle transition writes (S1192). */
	private static final String TARGET_PARAM = "target";
	/** Result-set column holding an operator's registered contact address (named, not duplicated — #6a). */
	private static final String CONTACT_EMAIL = "contact_email";

	private final JdbcClient jdbc;

	JdbcOperators(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<OperatorId> idByActiveUsername(String username) {
		return jdbc.sql("SELECT id FROM operator WHERE username = :username AND status = :active")
				.param(USERNAME, username)
				.param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
				.query(Long.class)
				.optional()
				.map(OperatorId::new);
	}

	@Override
	public Optional<OperatorCredential> credentialByUsername(String username) {
		// Any status — the edge builds a disabled principal for a non-ACTIVE account so the framework
		// rejects it before the password check. active is derived from the status token (invariant #6a);
		// is_admin drives the edge's ROLE_ADMIN grant.
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
				.param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
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
				.param(PENDING_PARAM, OperatorStatus.PENDING.name())
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
				.param(PENDING_PARAM, OperatorStatus.PENDING.name())
				.query((rs, rowNum) -> new PendingOperator(
						new OperatorId(rs.getLong(ID_PARAM)),
						rs.getString(USERNAME),
						rs.getString(CONTACT_EMAIL),
						rs.getObject("created_at", java.time.OffsetDateTime.class).toInstant()))
				.list();
	}

	/**
	 * Both decided states ({@code ACTIVE} + {@code SUSPENDED}), so a suspended operator stays visible
	 * and reinstatable — listing only ACTIVE would make suspension a one-way door. {@code contact_email}
	 * is NULL for a directly-provisioned account (the bootstrap admin); {@link OperatorAccount} and the
	 * console both treat it as optional.
	 */
	@Override
	public List<OperatorAccount> accounts() {
		return jdbc.sql("""
				SELECT id, username, contact_email, is_admin, status FROM operator
				WHERE status IN (:active, :suspended) ORDER BY username
				""")
				.param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
				.param(SUSPENDED_PARAM, OperatorStatus.SUSPENDED.name())
				.query((rs, rowNum) -> new OperatorAccount(
						new OperatorId(rs.getLong(ID_PARAM)),
						rs.getString(USERNAME),
						rs.getString(CONTACT_EMAIL),
						rs.getBoolean("is_admin"),
						OperatorStatus.SUSPENDED.name().equals(rs.getString("status"))))
				.list();
	}

	/** Primary-key point lookup with {@link #idByActiveUsername}'s status filter — no new index needed. */
	@Override
	public Optional<String> activeUsernameById(OperatorId operatorId) {
		return jdbc.sql("SELECT username FROM operator WHERE id = :id AND status = :active")
				.param(ID_PARAM, operatorId.value())
				.param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
				.query(String.class)
				.optional();
	}

	@Override
	public ApprovalOutcome activate(OperatorId operatorId) {
		return transitionFromPending(operatorId, OperatorStatus.ACTIVE)
				.<ApprovalOutcome>map(row -> new ApprovalOutcome.Approved(row.contactEmail()))
				.orElseGet(() -> classifyMissedTransition(operatorId));
	}

	@Override
	public ApprovalOutcome rejectPending(OperatorId operatorId) {
		return transitionFromPending(operatorId, OperatorStatus.REJECTED)
				.<ApprovalOutcome>map(row -> new ApprovalOutcome.Rejected())
				.orElseGet(() -> classifyMissedTransition(operatorId));
	}

	/** What the transition wrote — present iff this call is the one that flipped the row. */
	private record TransitionedRow(String contactEmail) {
	}

	/**
	 * Move a PENDING operator to {@code target}, reporting the row it wrote. The conditional
	 * {@code WHERE status = PENDING} is the single source of truth, so two concurrent approvals cannot
	 * both win; {@code RETURNING} hands the winner the stored contact email in the same statement,
	 * which is what lets {@code activate}'s caller mail an approved operator without a second read and
	 * without the loser being able to mail anything at all.
	 */
	private Optional<TransitionedRow> transitionFromPending(OperatorId operatorId, OperatorStatus target) {
		return jdbc.sql("""
				UPDATE operator SET status = :target
				WHERE id = :id AND status = :pending
				RETURNING contact_email
				""")
				.param(TARGET_PARAM, target.name())
				.param(ID_PARAM, operatorId.value())
				.param(PENDING_PARAM, OperatorStatus.PENDING.name())
				.query((rs, rowNum) -> new TransitionedRow(rs.getString(CONTACT_EMAIL)))
				.optional();
	}

	/**
	 * Why a PENDING-guarded transition wrote nothing: an existence read separates
	 * {@code NotPending} (already decided) from {@code NoSuchOperator} (unknown id), so the edge can
	 * answer 409 and 404 apart.
	 */
	private ApprovalOutcome classifyMissedTransition(OperatorId operatorId) {
		return exists(operatorId) ? new ApprovalOutcome.NotPending() : new ApprovalOutcome.NoSuchOperator();
	}

	@Override
	public OperatorLifecycleOutcome suspend(OperatorId operatorId) {
		return transition(operatorId, OperatorStatus.ACTIVE, OperatorStatus.SUSPENDED);
	}

	@Override
	public OperatorLifecycleOutcome reinstate(OperatorId operatorId) {
		return transition(operatorId, OperatorStatus.SUSPENDED, OperatorStatus.ACTIVE);
	}

	/**
	 * Move an operator between two statuses, returning its username on a hit. The {@code WHERE status =
	 * :expected} guard is the single source of truth — two concurrent suspends cannot both win — and
	 * {@code RETURNING username} hands the edge the principal name to revoke in the same statement, so
	 * no window opens between the status write and the read of who was suspended. A miss is classified
	 * by an existence read to distinguish "wrong status" from "no such operator".
	 */
	private OperatorLifecycleOutcome transition(OperatorId operatorId, OperatorStatus from, OperatorStatus to) {
		return jdbc.sql("""
				UPDATE operator SET status = :target
				WHERE id = :id AND status = :expected
				RETURNING username
				""")
				.param(TARGET_PARAM, to.name())
				.param(ID_PARAM, operatorId.value())
				.param("expected", from.name())
				.query(String.class)
				.optional()
				.<OperatorLifecycleOutcome>map(username -> new OperatorLifecycleOutcome.Changed(operatorId, username))
				.orElseGet(() -> exists(operatorId) ? new OperatorLifecycleOutcome.WrongStatus()
						: new OperatorLifecycleOutcome.NoSuchOperator());
	}

	private boolean exists(OperatorId operatorId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM operator WHERE id = :id)")
				.param(ID_PARAM, operatorId.value())
				.query(Boolean.class)
				.single();
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
				.param(OPERATOR_PARAM, operator.value())
				.param(VENUE_PARAM, venue.value())
				.query(Boolean.class)
				.single();
	}

	@Override
	public Set<VenueRef> ownedVenues(OperatorId operator) {
		return jdbc.sql("SELECT venue_id FROM operator_venue WHERE operator_id = :operator ORDER BY venue_id")
				.param(OPERATOR_PARAM, operator.value())
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
				.param(VENUE_PARAM, venue.value())
				.param(OPERATOR_PARAM, operator.value())
				.update();
	}

	@Override
	public boolean hasActiveOwner(VenueRef venue) {
		// PK probe on operator_venue(venue_id) joined to the tiny operator table.
		return jdbc.sql("""
				SELECT EXISTS (
				    SELECT 1 FROM operator_venue ov
				    JOIN operator o ON o.id = ov.operator_id
				    WHERE ov.venue_id = :venue AND o.status = :active
				)
				""")
				.param(VENUE_PARAM, venue.value())
				.param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
				.query(Boolean.class)
				.single();
	}

	@Override
	public Set<VenueRef> venuesWithActiveOwner(Collection<VenueRef> venues) {
		if (venues.isEmpty()) {
			return Set.of();
		}
		return jdbc.sql("""
				SELECT ov.venue_id FROM operator_venue ov
				JOIN operator o ON o.id = ov.operator_id
				WHERE o.status = :active AND ov.venue_id IN (:venues)
				""")
				.param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
				.param("venues", venues.stream().map(VenueRef::value).toList())
				.query(Long.class)
				.list().stream()
				.map(VenueRef::new)
				.collect(Collectors.toUnmodifiableSet());
	}
}
