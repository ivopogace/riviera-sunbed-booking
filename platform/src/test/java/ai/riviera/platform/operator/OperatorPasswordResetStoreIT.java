package ai.riviera.platform.operator;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.api.OperatorPasswordReset;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorResetOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;
import ai.riviera.platform.operator.vocabulary.ResetLinkOutcome;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The {@code operator} side of an admin-issued reset (#1737) against Testcontainers Postgres: the real
 * {@link OperatorPasswordReset} over the V82 table. Hashes here are opaque strings; minting and digesting
 * the raw token is {@code auth}'s, pinned end to end by {@code OperatorPasswordResetIT}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OperatorPasswordResetStoreIT {

	private static final String BOOTSTRAP = "operator";
	private static final String NEW_HASH = "{bcrypt}new-opaque-hash";

	@Autowired
	OperatorPasswordReset reset;
	@Autowired
	OperatorLifecycle lifecycle;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clearNonBootstrapOperators() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username <> :bootstrap)").param("bootstrap", BOOTSTRAP).update();
		jdbc.sql("DELETE FROM operator WHERE username <> :bootstrap").param("bootstrap", BOOTSTRAP).update();
	}

	@Test
	void anIssuedTokenResetsTheHashOnceAndNamesThePrincipal() {
		OperatorId id = insertOperator("reset-store-active", OperatorStatus.ACTIVE);

		assertEquals(new ResetLinkOutcome.Issued(), reset.issue(id, "hash-a", inAnHour()));
		assertEquals(Optional.of("reset-store-active"), reset.usernameForResetToken("hash-a"));

		assertEquals(new OperatorResetOutcome.Reset("reset-store-active"), reset.resetPassword("hash-a", NEW_HASH));
		assertEquals(NEW_HASH, passwordHashOf(id));
		assertInstanceOf(OperatorResetOutcome.InvalidOrExpired.class, reset.resetPassword("hash-a", "{bcrypt}again"));
		assertEquals(NEW_HASH, passwordHashOf(id));
		assertEquals(Optional.empty(), reset.usernameForResetToken("hash-a"));
	}

	@Test
	void theReadConsumesNothing() {
		OperatorId id = insertOperator("reset-store-read", OperatorStatus.ACTIVE);
		reset.issue(id, "hash-read", inAnHour());

		reset.usernameForResetToken("hash-read");
		reset.usernameForResetToken("hash-read");

		assertInstanceOf(OperatorResetOutcome.Reset.class, reset.resetPassword("hash-read", NEW_HASH));
	}

	@Test
	void aSecondIssueRetiresTheFirstToken() {
		OperatorId id = insertOperator("reset-store-twice", OperatorStatus.ACTIVE);
		reset.issue(id, "hash-first", inAnHour());
		reset.issue(id, "hash-second", inAnHour());

		assertEquals(Optional.empty(), reset.usernameForResetToken("hash-first"));
		assertInstanceOf(OperatorResetOutcome.InvalidOrExpired.class, reset.resetPassword("hash-first", NEW_HASH));
		assertInstanceOf(OperatorResetOutcome.Reset.class, reset.resetPassword("hash-second", NEW_HASH));
	}

	@Test
	void expiredAndUnknownTokensAreRefusedAndWriteNothing() {
		OperatorId id = insertOperator("reset-store-expired", OperatorStatus.ACTIVE);
		reset.issue(id, "hash-expired", Instant.now().minus(Duration.ofMinutes(1)));

		assertEquals(Optional.empty(), reset.usernameForResetToken("hash-expired"));
		assertInstanceOf(OperatorResetOutcome.InvalidOrExpired.class, reset.resetPassword("hash-expired", NEW_HASH));
		assertInstanceOf(OperatorResetOutcome.InvalidOrExpired.class, reset.resetPassword("hash-unknown", NEW_HASH));
		assertEquals("{bcrypt}seeded", passwordHashOf(id));
	}

	@Test
	void onlyAnActiveOperatorIsIssuedALink() {
		OperatorId suspended = insertOperator("reset-store-suspended", OperatorStatus.SUSPENDED);
		OperatorId pending = insertOperator("reset-store-pending", OperatorStatus.PENDING);

		assertInstanceOf(ResetLinkOutcome.NotActive.class, reset.issue(suspended, "hash-s", inAnHour()));
		assertInstanceOf(ResetLinkOutcome.NotActive.class, reset.issue(pending, "hash-p", inAnHour()));
		assertInstanceOf(ResetLinkOutcome.NoSuchOperator.class, reset.issue(new OperatorId(-1L), "hash-n", inAnHour()));
		assertEquals(0, tokenRowsOf(suspended) + tokenRowsOf(pending));
	}

	@Test
	void aLinkIssuedBeforeASuspensionStaysDeadAfterReinstatement() {
		OperatorId id = insertOperator("reset-store-pre-suspend", OperatorStatus.ACTIVE);
		reset.issue(id, "hash-pre-suspend", inAnHour());

		lifecycle.suspend(bootstrapAdmin(), id);
		assertInstanceOf(OperatorResetOutcome.InvalidOrExpired.class, reset.resetPassword("hash-pre-suspend", NEW_HASH));

		lifecycle.reinstate(id);
		assertEquals(Optional.empty(), reset.usernameForResetToken("hash-pre-suspend"));
		assertInstanceOf(OperatorResetOutcome.InvalidOrExpired.class, reset.resetPassword("hash-pre-suspend", NEW_HASH));
		assertEquals("{bcrypt}seeded", passwordHashOf(id));
	}

	@Test
	void aSuspendedOperatorsLiveTokenIsRefusedEvenUnretired() {
		OperatorId id = insertOperator("reset-store-raw-suspend", OperatorStatus.ACTIVE);
		reset.issue(id, "hash-raw-suspend", inAnHour());
		jdbc.sql("UPDATE operator SET status = 'SUSPENDED' WHERE id = :id").param("id", id.value()).update();

		assertEquals(Optional.empty(), reset.usernameForResetToken("hash-raw-suspend"));
		assertInstanceOf(OperatorResetOutcome.InvalidOrExpired.class, reset.resetPassword("hash-raw-suspend", NEW_HASH));
		assertEquals("{bcrypt}seeded", passwordHashOf(id));
	}

	@Test
	void theSchemaHoldsOneLiveTokenPerOperator() {
		OperatorId id = insertOperator("reset-store-schema", OperatorStatus.ACTIVE);
		insertLiveToken(id, "hash-row-1");

		assertThrows(DuplicateKeyException.class, () -> insertLiveToken(id, "hash-row-2"));
	}

	private void insertLiveToken(OperatorId id, String hash) {
		jdbc.sql("""
				INSERT INTO operator_password_reset_token (operator_id, token_hash, expires_at)
				VALUES (:id, :hash, NOW() + INTERVAL '1 hour')
				""")
				.param("id", id.value())
				.param("hash", hash)
				.update();
	}

	private static Instant inAnHour() {
		return Instant.now().plus(Duration.ofHours(1));
	}

	private OperatorId insertOperator(String username, OperatorStatus status) {
		long id = jdbc.sql("""
				INSERT INTO operator (username, status, password_hash, contact_email)
				VALUES (:username, :status, '{bcrypt}seeded', :email) RETURNING id
				""")
				.param("username", username)
				.param("status", status.name())
				.param("email", username + "@example.com")
				.query(Long.class)
				.single();
		return new OperatorId(id);
	}

	private String passwordHashOf(OperatorId id) {
		return jdbc.sql("SELECT password_hash FROM operator WHERE id = :id")
				.param("id", id.value())
				.query(String.class)
				.single();
	}

	private int tokenRowsOf(OperatorId id) {
		return jdbc.sql("SELECT COUNT(*) FROM operator_password_reset_token WHERE operator_id = :id")
				.param("id", id.value())
				.query(Integer.class)
				.single();
	}

	private OperatorId bootstrapAdmin() {
		return new OperatorId(jdbc.sql("SELECT id FROM operator WHERE username = :u").param("u", BOOTSTRAP)
				.query(Long.class).single());
	}
}
