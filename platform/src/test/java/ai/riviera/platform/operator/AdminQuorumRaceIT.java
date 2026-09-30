package ai.riviera.platform.operator;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.LockOrderRace;
import ai.riviera.platform.PausingPorts;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Concurrent admin suspends keep at least one active admin (#1311): each suspend holds its status write open while a
 * rival runs. The seeded bootstrap admin is set aside for the test so the admins here are the only ones.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, PausingPorts.class})
@SpringBootTest
class AdminQuorumRaceIT {

	private static final String BOOTSTRAP = "operator";

	@Autowired
	OperatorLifecycle lifecycle;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void setAsideTheBootstrapAdmin() {
		jdbc.sql("UPDATE operator SET status = 'SUSPENDED' WHERE username = :u").param("u", BOOTSTRAP).update();
	}

	@AfterEach
	void restore() {
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'quorum-%'").update();
		jdbc.sql("UPDATE operator SET status = 'ACTIVE' WHERE username = :u").param("u", BOOTSTRAP).update();
	}

	@Test
	void twoAdminsSuspendingEachOtherLeaveOneActive() throws Exception {
		OperatorId x = admin("quorum-x");
		OperatorId y = admin("quorum-y");

		LockOrderRace.Outcome<OperatorLifecycleOutcome, OperatorLifecycleOutcome> outcome = LockOrderRace.race(jdbc,
				"suspend", args -> y.equals(args[0]),
				() -> lifecycle.suspend(x, y),
				() -> lifecycle.suspend(y, x));

		assertThat(outcome.held()).isInstanceOf(OperatorLifecycleOutcome.Changed.class);
		assertThat(outcome.raced()).isInstanceOf(OperatorLifecycleOutcome.LastActiveAdmin.class);
		assertThat(activeAdmins()).containsExactly("quorum-x");
	}

	@Test
	void aSuspendByAnAdminSuspendedMeanwhileDoesNothing() throws Exception {
		OperatorId x = admin("quorum-x");
		OperatorId y = admin("quorum-y");
		OperatorId z = admin("quorum-z");

		LockOrderRace.Outcome<OperatorLifecycleOutcome, OperatorLifecycleOutcome> outcome = LockOrderRace.race(jdbc,
				"suspend", args -> x.equals(args[0]),
				() -> lifecycle.suspend(z, x),
				() -> lifecycle.suspend(x, y));

		assertThat(outcome.held()).isInstanceOf(OperatorLifecycleOutcome.Changed.class);
		assertThat(outcome.raced()).isInstanceOf(OperatorLifecycleOutcome.ActorNotActiveAdmin.class);
		assertThat(activeAdmins()).containsExactly("quorum-y", "quorum-z");
	}

	private OperatorId admin(String username) {
		return new OperatorId(jdbc.sql("""
				INSERT INTO operator (username, status, is_admin, password_hash)
				VALUES (:u, 'ACTIVE', TRUE, '{noop}x') RETURNING id
				""").param("u", username).query(Long.class).single());
	}

	private List<String> activeAdmins() {
		return jdbc.sql("SELECT username FROM operator WHERE is_admin AND status = 'ACTIVE' ORDER BY username")
				.query(String.class).list();
	}
}
