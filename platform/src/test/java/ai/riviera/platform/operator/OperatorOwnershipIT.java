package ai.riviera.platform.operator;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.NotVenueOwnerException;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.api.VenueRef;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Module test for the {@code operator} ownership port (issue #73, AC-1/AC-2) against Testcontainers
 * Postgres — the real {@link VenueOwnership}/{@link OperatorDirectory} beans over {@code JdbcOperators}
 * and the V16 schema. Seeds two synthetic per-venue operators plus relies on the seeded owns-all
 * bootstrap, and proves {@code assertOwns} passes/denies correctly, {@code ownedVenues} returns the
 * explicit mapping, and {@code operatorFor} resolves an ACTIVE username but not an unknown/suspended one.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OperatorOwnershipIT {

	private static final long MIRAMAR = 1L; // seeded venue (V3); the only venue an FK mapping can target here

	@Autowired
	VenueOwnership ownership;
	@Autowired
	OperatorDirectory directory;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clearNonBootstrapOperators() {
		// Scope the cleanup to the non-bootstrap operators this test creates — don't truncate the
		// whole mapping table (which would wipe any seeded/other-test rows on the shared container).
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username <> 'operator')").update();
		jdbc.sql("DELETE FROM operator WHERE username <> 'operator'").update();
	}

	private OperatorId insertOperator(String username, String status) {
		long id = jdbc.sql("""
				INSERT INTO operator (username, status, owns_all_venues)
				VALUES (:username, :status, FALSE) RETURNING id
				""")
				.param("username", username)
				.param("status", status)
				.query(Long.class)
				.single();
		return new OperatorId(id);
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:venue, :operator)")
				.param("venue", venueId)
				.param("operator", operator.value())
				.update();
	}

	@Test
	void assertOwnsPassesForAnExplicitlyMappedVenue() {
		OperatorId owner = insertOperator("owner-a", "ACTIVE");
		grant(owner, MIRAMAR);

		assertDoesNotThrow(() -> ownership.assertOwns(owner, new VenueRef(MIRAMAR)));
	}

	@Test
	void assertOwnsDeniesAnUnownedVenue() {
		OperatorId stranger = insertOperator("stranger-b", "ACTIVE");
		// stranger owns nothing → any venue is denied, including a non-existent one
		assertThrows(NotVenueOwnerException.class,
				() -> ownership.assertOwns(stranger, new VenueRef(MIRAMAR)));
		assertThrows(NotVenueOwnerException.class,
				() -> ownership.assertOwns(stranger, new VenueRef(999_999L)));
	}

	@Test
	void bootstrapOperatorOwnsEveryVenue() {
		OperatorId bootstrap = directory.operatorFor("operator").orElseThrow();

		// owns-all short-circuit: passes for any venue, including one with no mapping row
		assertDoesNotThrow(() -> ownership.assertOwns(bootstrap, new VenueRef(MIRAMAR)));
		assertDoesNotThrow(() -> ownership.assertOwns(bootstrap, new VenueRef(424_242L)));
	}

	@Test
	void ownedVenuesReturnsTheExplicitMapping() {
		OperatorId owner = insertOperator("owner-c", "ACTIVE");
		grant(owner, MIRAMAR);

		assertEquals(java.util.Set.of(new VenueRef(MIRAMAR)), ownership.ownedVenues(owner));
	}

	@Test
	void operatorForResolvesTheSeededBootstrapUsername() {
		assertTrue(directory.operatorFor("operator").isPresent());
	}

	@Test
	void operatorForRejectsUnknownAndSuspendedUsernames() {
		insertOperator("suspended-d", "SUSPENDED");

		assertTrue(directory.operatorFor("no-such-operator").isEmpty());
		assertTrue(directory.operatorFor("suspended-d").isEmpty());
	}
}
