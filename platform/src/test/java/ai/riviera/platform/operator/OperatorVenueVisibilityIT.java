package ai.riviera.platform.operator;

import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.VenueVisibility;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Module test for the {@code operator} visibility port (#693) against Testcontainers Postgres —
 * the real {@link VenueVisibility} bean over {@code JdbcOperators} and the schema. A venue is
 * visible iff its owning operator is {@code ACTIVE}; every other status and an absent ownership
 * row answer not-visible (fail-closed).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OperatorVenueVisibilityIT {

	@Autowired
	VenueVisibility visibility;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clearNonBootstrapOperators() {
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

	private VenueRef newVenue(String name) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).query(Long.class).single();
		return new VenueRef(id);
	}

	private VenueRef ownedVenue(String username, String status) {
		OperatorId owner = insertOperator(username, status);
		VenueRef venue = newVenue(username + " venue");
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:venue, :operator)")
				.param("venue", venue.value())
				.param("operator", owner.value())
				.update();
		return venue;
	}

	@Test
	void venueOwnedByActiveOperatorIsVisible() {
		VenueRef venue = ownedVenue("vis-active", "ACTIVE");

		assertTrue(visibility.isVisible(venue));
	}

	@Test
	void venueOwnedByNonActiveOperatorIsNotVisible() {
		assertFalse(visibility.isVisible(ownedVenue("vis-pending", "PENDING")));
		assertFalse(visibility.isVisible(ownedVenue("vis-suspended", "SUSPENDED")));
		assertFalse(visibility.isVisible(ownedVenue("vis-rejected", "REJECTED")));
	}

	@Test
	void unownedVenueIsNotVisible() {
		// Fail-closed: no ownership row means no ACTIVE owner, so the venue is hidden.
		VenueRef orphan = newVenue("vis-orphan venue");

		assertFalse(visibility.isVisible(orphan));
		assertFalse(visibility.isVisible(new VenueRef(999_999L)));
	}

	@Test
	void visibleAmongKeepsOnlyActiveOwnedVenues() {
		VenueRef active = ownedVenue("vis-among-active", "ACTIVE");
		VenueRef pending = ownedVenue("vis-among-pending", "PENDING");
		VenueRef orphan = newVenue("vis-among-orphan venue");

		assertEquals(Set.of(active), visibility.visibleAmong(Set.of(active, pending, orphan)));
	}

	@Test
	void visibleAmongEmptyInputAnswersEmptyWithoutQuerying() {
		assertEquals(Set.of(), visibility.visibleAmong(Set.of()));
	}

	@Test
	void statusChangeFlipsVisibilityBothWays() {
		VenueRef venue = ownedVenue("vis-flip", "PENDING");
		assertFalse(visibility.isVisible(venue));

		setStatus("vis-flip", "ACTIVE");
		assertTrue(visibility.isVisible(venue));

		setStatus("vis-flip", "SUSPENDED");
		assertFalse(visibility.isVisible(venue));

		setStatus("vis-flip", "ACTIVE");
		assertTrue(visibility.isVisible(venue));
	}

	private void setStatus(String username, String status) {
		jdbc.sql("UPDATE operator SET status = :status WHERE username = :username")
				.param("status", status)
				.param("username", username)
				.update();
	}
}
