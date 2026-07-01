package ai.riviera.platform.operator;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorCredential;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.OperatorProvisioning;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Module test for the {@code operator} credential ports (issue #74, AC-1/AC-2) against Testcontainers
 * Postgres — the real {@link OperatorAccounts}/{@link OperatorProvisioning} beans over
 * {@code JdbcOperators} and the V17 {@code password_hash} column. Proves provisioning stores a
 * per-operator credential, {@code findByUsername} reads it back with the right {@code active} flag,
 * rotation updates the stored hash, and the unknown/suspended edge cases behave. The hash here is an
 * arbitrary opaque token — this layer never encodes/verifies it (that is the edge's job).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OperatorAccountProvisioningIT {

	@Autowired
	OperatorAccounts accounts;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clearSyntheticOperators() {
		// Scope cleanup to this test's synthetic operators; never touch the seeded bootstrap 'operator'.
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'prov-%'").update();
	}

	@Test
	void provisionStoresAPerOperatorCredentialThatReadsBack() {
		OperatorId id = provisioning.provision("prov-a", "{noop}hash-a");

		OperatorCredential credential = accounts.findByUsername("prov-a").orElseThrow();
		assertEquals("prov-a", credential.username());
		assertEquals("{noop}hash-a", credential.passwordHash());
		assertTrue(credential.active());
		// A freshly provisioned operator is ACTIVE and resolvable as an owning principal.
		assertTrue(id.value() > 0);
	}

	@Test
	void setPasswordRotatesTheStoredHash() {
		provisioning.provision("prov-b", "{noop}old");

		assertTrue(provisioning.setPassword("prov-b", "{noop}new"));

		assertEquals("{noop}new", accounts.findByUsername("prov-b").orElseThrow().passwordHash());
	}

	@Test
	void setPasswordOnUnknownUsernameReturnsFalseAndCreatesNothing() {
		assertFalse(provisioning.setPassword("prov-nobody", "{noop}x"));
		assertTrue(accounts.findByUsername("prov-nobody").isEmpty());
	}

	@Test
	void findByUsernameIsEmptyForUnknownUsername() {
		assertTrue(accounts.findByUsername("prov-unknown").isEmpty());
	}

	@Test
	void suspendedAccountIsReturnedButInactive() {
		provisioning.provision("prov-susp", "{noop}h");
		jdbc.sql("UPDATE operator SET status = 'SUSPENDED' WHERE username = 'prov-susp'").update();

		OperatorCredential credential = accounts.findByUsername("prov-susp").orElseThrow();
		assertFalse(credential.active());
	}

	@Test
	void anAccountWithNoProvisionedCredentialHasANullHash() {
		// Insert a bare operator row (no password_hash) to mimic an unprovisioned account.
		jdbc.sql("INSERT INTO operator (username, status, owns_all_venues) VALUES ('prov-bare', 'ACTIVE', FALSE)")
				.update();

		OperatorCredential credential = accounts.findByUsername("prov-bare").orElseThrow();
		assertNull(credential.passwordHash());
		assertTrue(credential.active());
	}
}
