package ai.riviera.platform.operator;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Module test for the {@code operator} ownership port (issue #73, AC-1/AC-2; extended by #115) against
 * Testcontainers Postgres — the real {@link VenueOwnership}/{@link OperatorDirectory} beans over
 * {@code JdbcOperators} and the schema. Seeds synthetic per-venue operators over fresh venues, and
 * proves {@code assertOwns}/{@link VenueOwnership#assignOwner} pass/deny correctly, {@code ownedVenues}
 * returns the explicit mapping, and {@code operatorFor} resolves an ACTIVE username but not an
 * unknown/suspended one. With the owns-all bootstrap retired (#115), the seeded {@code operator} owns
 * only its <em>backfilled</em> venue (Miramar, V29), not an arbitrary one.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OperatorOwnershipIT {

	private static final long MIRAMAR = 1L; // seeded venue (V3); backfilled to the bootstrap admin by V29

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
				INSERT INTO operator (username, status)
				VALUES (:username, :status) RETURNING id
				""")
				.param("username", username)
				.param("status", status)
				.query(Long.class)
				.single();
		return new OperatorId(id);
	}

	/** A fresh venue (never Miramar — that is now owned by the backfilled bootstrap, one owner per venue). */
	private long newVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).query(Long.class).single();
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
		long venue = newVenue("owner-a venue");
		grant(owner, venue);

		assertDoesNotThrow(() -> ownership.assertOwns(owner, new VenueRef(venue)));
	}

	@Test
	void assignOwnerRecordsTheMapping() {
		// The write side (#115, creator-owns-on-create): assignOwner then assertOwns passes for the
		// owner and denies anyone else.
		OperatorId owner = insertOperator("owner-w", "ACTIVE");
		OperatorId other = insertOperator("owner-x", "ACTIVE");
		long venue = newVenue("assign venue");

		ownership.assignOwner(owner, new VenueRef(venue));

		assertDoesNotThrow(() -> ownership.assertOwns(owner, new VenueRef(venue)));
		assertThrows(NotVenueOwnerException.class,
				() -> ownership.assertOwns(other, new VenueRef(venue)));
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
	void bootstrapOwnsOnlyBackfilledVenuesNotAll() {
		// Owns-all retired (#115): the bootstrap owns Miramar via the V29 backfill (explicit mapping)…
		OperatorId bootstrap = directory.operatorFor("operator").orElseThrow();
		assertDoesNotThrow(() -> ownership.assertOwns(bootstrap, new VenueRef(MIRAMAR)));

		// …but NOT an arbitrary venue created after the migration — there is no owns-all short-circuit.
		long fresh = newVenue("post-migration venue");
		assertThrows(NotVenueOwnerException.class,
				() -> ownership.assertOwns(bootstrap, new VenueRef(fresh)));
	}

	@Test
	void ownedVenuesReturnsTheExplicitMapping() {
		OperatorId owner = insertOperator("owner-c", "ACTIVE");
		long venue = newVenue("owner-c venue");
		grant(owner, venue);

		assertEquals(Set.of(new VenueRef(venue)), ownership.ownedVenues(owner));
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
