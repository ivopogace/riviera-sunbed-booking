package ai.riviera.platform.operator;

import java.util.List;
import java.util.Optional;

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
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
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

		// The username comes back, so the edge revokes without a second round-trip.
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

	/**
	 * #357: the pre-read that lets the edge revoke an operator's sessions <em>before</em> the suspension
	 * commits. It must apply exactly the ACTIVE-only rule the rest of the module resolves by — a username
	 * for a PENDING/REJECTED/SUSPENDED account would revoke sessions for a transition that is then refused.
	 */
	@Test
	void activeUsernameResolvesOnlyAnActiveOperator() {
		OperatorId active = insertOperator("lifecycle-named", OperatorStatus.ACTIVE);
		OperatorId pending = insertOperator("lifecycle-named-pending", OperatorStatus.PENDING);
		OperatorId rejected = insertOperator("lifecycle-named-rejected", OperatorStatus.REJECTED);
		OperatorId suspended = insertOperator("lifecycle-named-suspended", OperatorStatus.SUSPENDED);

		assertEquals(Optional.of("lifecycle-named"), lifecycle.activeUsername(active));
		assertEquals(Optional.empty(), lifecycle.activeUsername(pending));
		assertEquals(Optional.empty(), lifecycle.activeUsername(rejected));
		assertEquals(Optional.empty(), lifecycle.activeUsername(suspended));
		assertEquals(Optional.empty(), lifecycle.activeUsername(new OperatorId(-1L)));
	}

	/** The read is pure: naming an operator must not move it, so the suspension after it still applies. */
	@Test
	void activeUsernameChangesNothing() {
		OperatorId id = insertOperator("lifecycle-named-untouched", OperatorStatus.ACTIVE);

		assertEquals(Optional.of("lifecycle-named-untouched"), lifecycle.activeUsername(id));
		assertEquals(OperatorStatus.ACTIVE.name(), statusOf(id));
		assertInstanceOf(OperatorLifecycleOutcome.Changed.class, lifecycle.suspend(id));
	}

	/**
	 * #375: the approval outcome reports the address the operator registered with, so the edge can mail
	 * it the "you can sign in now" notice without a second read — the same reasoning that put the
	 * username on {@link OperatorLifecycleOutcome.Changed} (#128/#357). The address comes from the
	 * {@code RETURNING} clause of the PENDING-guarded {@code UPDATE}, which is what ties it to the call
	 * that actually flipped the row rather than to the id that was asked about.
	 */
	@Test
	void approveActivatesAPendingOperatorAndReportsItsContactEmail() {
		OperatorId id = insertOperator("lifecycle-approve", OperatorStatus.PENDING);

		assertEquals(new ApprovalOutcome.Approved("lifecycle-approve@example.com"), lifecycle.approve(id));
		assertEquals(OperatorStatus.ACTIVE.name(), statusOf(id));
	}

	/**
	 * The exactly-once guarantee behind AC-2, stated where it is actually enforced: a second approval
	 * loses the {@code WHERE status = PENDING} guard, so it returns no row and therefore no address —
	 * there is nothing for the edge to mail twice, and no ordering at the edge has to arrange that.
	 */
	@Test
	void aSecondApproveIsNotPendingAndCarriesNoAddress() {
		OperatorId id = insertOperator("lifecycle-approve-twice", OperatorStatus.PENDING);
		lifecycle.approve(id);

		assertEquals(new ApprovalOutcome.NotPending(), lifecycle.approve(id));
		assertEquals(new ApprovalOutcome.NoSuchOperator(), lifecycle.approve(new OperatorId(-1L)));
		assertEquals(OperatorStatus.ACTIVE.name(), statusOf(id));
	}

	@Test
	void rejectMovesAPendingOperatorToRejectedAndCarriesNoAddress() {
		OperatorId id = insertOperator("lifecycle-reject", OperatorStatus.PENDING);

		assertEquals(new ApprovalOutcome.Rejected(), lifecycle.reject(id));
		assertEquals(new ApprovalOutcome.NotPending(), lifecycle.reject(id));
		assertEquals(OperatorStatus.REJECTED.name(), statusOf(id));
	}

	/**
	 * {@code contact_email} is nullable (V29 — the env-managed bootstrap admin has none), so the outcome
	 * has to survive a row that carries no address. Reaching this state through self-registration is not
	 * possible today (the edge requires a non-blank one), which is exactly why it is pinned here: the
	 * schema still permits the row, so the edge's guard must have something to guard against.
	 */
	@Test
	void approveReportsANullAddressWhenTheRowCarriesNone() {
		OperatorId id = insertOperator("lifecycle-approve-no-email", OperatorStatus.PENDING, null);

		assertEquals(new ApprovalOutcome.Approved(null), lifecycle.approve(id));
	}

	private OperatorId insertOperator(String username, OperatorStatus status) {
		return insertOperator(username, status, username + "@example.com");
	}

	private OperatorId insertOperator(String username, OperatorStatus status, String contactEmail) {
		long id = jdbc.sql("""
				INSERT INTO operator (username, status, contact_email)
				VALUES (:username, :status, :email) RETURNING id
				""")
				.param("username", username)
				.param("status", status.name())
				.param("email", contactEmail)
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
