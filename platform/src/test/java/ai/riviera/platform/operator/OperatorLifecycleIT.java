package ai.riviera.platform.operator;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.domain.OperatorStatus;
import ai.riviera.platform.operator.vocabulary.OperatorAccount;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Module test for the {@code operator} lifecycle transitions added by #128 (AC-3, AC-4) against
 * Testcontainers Postgres — the real {@link OperatorLifecycle} bean over {@code JdbcOperators} and the
 * schema. Suspension is the transition #128 needs to exist before session revocation has anything to
 * hang off: before this slice, {@code SUSPENDED} was a token the enum and the V29 check constraint
 * both knew but nothing in the application could ever write.
 *
 * <p>The guard lives in the {@code UPDATE … WHERE status = :expected}, so a transition is atomic and
 * two concurrent suspends cannot both report success — the same shape as the shipped approve/reject
 * path. These tests assert the outcome <em>and</em> that a rejected transition writes nothing.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OperatorLifecycleIT {

	private static final String BOOTSTRAP = "operator";

	@Autowired
	OperatorLifecycle lifecycle;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clearNonBootstrapOperators() {
		// Scope the cleanup to this test's own rows — the container is shared with other ITs.
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username <> :bootstrap)").param("bootstrap", BOOTSTRAP).update();
		jdbc.sql("DELETE FROM operator WHERE username <> :bootstrap").param("bootstrap", BOOTSTRAP).update();
	}

	@Test
	void suspendMovesAnOperatorAccountToSuspendedAndNamesThePrincipal() {
		OperatorId id = insertOperator("lifecycle-active", OperatorStatus.ACTIVE);

		OperatorLifecycleOutcome outcome = lifecycle.suspend(id);

		// The username comes back so the edge can revoke that principal's sessions without a second
		// round-trip — the shipped ResetPasswordOutcome.Reset(accountId, email) shape.
		assertEquals(new OperatorLifecycleOutcome.Changed(id, "lifecycle-active"), outcome);
		assertEquals(OperatorStatus.SUSPENDED.name(), statusOf(id));
	}

	@Test
	void suspendRejectsNonActiveAndUnknownOperators() {
		OperatorId pending = insertOperator("lifecycle-pending", OperatorStatus.PENDING);
		OperatorId alreadySuspended = insertOperator("lifecycle-suspended", OperatorStatus.SUSPENDED);

		assertInstanceOf(OperatorLifecycleOutcome.WrongStatus.class, lifecycle.suspend(pending));
		assertInstanceOf(OperatorLifecycleOutcome.WrongStatus.class, lifecycle.suspend(alreadySuspended));
		assertInstanceOf(OperatorLifecycleOutcome.NoSuchOperator.class, lifecycle.suspend(new OperatorId(-1L)));

		assertEquals(OperatorStatus.PENDING.name(), statusOf(pending));
		assertEquals(OperatorStatus.SUSPENDED.name(), statusOf(alreadySuspended));
	}

	@Test
	void reinstateRestoresASuspendedOperator() {
		OperatorId id = insertOperator("lifecycle-reinstate", OperatorStatus.SUSPENDED);

		assertEquals(new OperatorLifecycleOutcome.Changed(id, "lifecycle-reinstate"), lifecycle.reinstate(id));
		assertEquals(OperatorStatus.ACTIVE.name(), statusOf(id));
	}

	@Test
	void reinstateRejectsAnOperatorThatIsNotSuspended() {
		OperatorId active = insertOperator("lifecycle-not-suspended", OperatorStatus.ACTIVE);

		assertInstanceOf(OperatorLifecycleOutcome.WrongStatus.class, lifecycle.reinstate(active));
		assertInstanceOf(OperatorLifecycleOutcome.NoSuchOperator.class, lifecycle.reinstate(new OperatorId(-1L)));

		assertEquals(OperatorStatus.ACTIVE.name(), statusOf(active));
	}

	@Test
	void accountsListsActiveAndSuspendedButNotPendingOrRejected() {
		OperatorId active = insertOperator("lifecycle-listed", OperatorStatus.ACTIVE);
		OperatorId suspended = insertOperator("lifecycle-listed-suspended", OperatorStatus.SUSPENDED);
		insertOperator("lifecycle-unlisted-pending", OperatorStatus.PENDING);
		insertOperator("lifecycle-unlisted-rejected", OperatorStatus.REJECTED);

		List<OperatorAccount> accounts = lifecycle.accounts();
		List<String> usernames = accounts.stream().map(OperatorAccount::username).toList();

		// A suspended operator stays listed — otherwise it would vanish from the console and suspension
		// would be a one-way door, undoable only by hand-run SQL.
		assertEquals(List.of("lifecycle-listed", "lifecycle-listed-suspended", BOOTSTRAP), usernames);
		assertTrue(accounts.stream().anyMatch(o -> o.id().equals(active) && !o.suspended() && !o.admin()));
		assertTrue(accounts.stream().anyMatch(o -> o.id().equals(suspended) && o.suspended()));
		assertTrue(accounts.stream().anyMatch(o -> BOOTSTRAP.equals(o.username()) && o.admin()));
	}

	private OperatorId insertOperator(String username, OperatorStatus status) {
		long id = jdbc.sql("""
				INSERT INTO operator (username, status, contact_email)
				VALUES (:username, :status, :email) RETURNING id
				""")
				.param("username", username)
				.param("status", status.name())
				.param("email", username + "@example.com")
				.query(Long.class)
				.single();
		return new OperatorId(id);
	}

	private String statusOf(OperatorId id) {
		return jdbc.sql("SELECT status FROM operator WHERE id = :id")
				.param("id", id.value())
				.query(String.class)
				.single();
	}
}
