package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The #693 catalogue fence at the {@link VenueCatalog} seam (Testcontainers Postgres): both
 * tourist reads exclude a venue whose owning operator is not {@code ACTIVE}, and the operator's
 * lifecycle transitions alone flip visibility — no venue-side action anywhere in these tests.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueCatalogVisibilityIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	VenueCatalog catalog;
	@Autowired
	OperatorLifecycle lifecycle;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	@AfterEach
	void clearFixtures() {
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN "
				+ "(SELECT id FROM venue WHERE name LIKE 'viscat %')").update();
		jdbc.sql("DELETE FROM venue WHERE name LIKE 'viscat %'").update();
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'viscat-%'").update();
	}

	private OperatorId insertOperator(String username, String status) {
		long id = jdbc.sql("""
				INSERT INTO operator (username, status, contact_email)
				VALUES (:username, :status, :email) RETURNING id
				""")
				.param("username", username)
				.param("status", status)
				.param("email", username + "@example.test")
				.query(Long.class)
				.single();
		return new OperatorId(id);
	}

	private VenueId ownedVenue(String name, OperatorId owner) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:venue, :operator)")
				.param("venue", id)
				.param("operator", owner.value())
				.update();
		return new VenueId(id);
	}

	private LocalDate tomorrow() {
		return LocalDate.now(TIRANE).plusDays(1);
	}

	private boolean listedByName(String name) {
		List<VenueSummaryView> venues = catalog.listVenues(VenueFilter.of(null, null), tomorrow());
		return venues.stream().anyMatch(v -> name.equals(v.name()));
	}

	@Test
	void listOmitsPendingOwnedVenueUntilApproved() {
		OperatorId owner = insertOperator("viscat-pending", "PENDING");
		ownedVenue("viscat pending venue", owner);

		assertFalse(listedByName("viscat pending venue"));

		lifecycle.approve(owner);

		assertTrue(listedByName("viscat pending venue"));
	}

	@Test
	void mapReadIsEmptyForHiddenVenue() {
		OperatorId owner = insertOperator("viscat-hidden", "PENDING");
		VenueId venue = ownedVenue("viscat hidden venue", owner);

		assertTrue(catalog.findVenueMap(venue, tomorrow()).isEmpty());

		lifecycle.approve(owner);

		assertTrue(catalog.findVenueMap(venue, tomorrow()).isPresent());
	}

	@Test
	void suspendHidesReinstateRestores() {
		OperatorId owner = insertOperator("viscat-season", "ACTIVE");
		VenueId venue = ownedVenue("viscat season venue", owner);

		assertTrue(listedByName("viscat season venue"));
		assertTrue(catalog.findVenueMap(venue, tomorrow()).isPresent());

		lifecycle.suspend(owner);
		assertFalse(listedByName("viscat season venue"));
		assertTrue(catalog.findVenueMap(venue, tomorrow()).isEmpty());

		lifecycle.reinstate(owner);
		assertTrue(listedByName("viscat season venue"));
		assertTrue(catalog.findVenueMap(venue, tomorrow()).isPresent());
	}

	@Test
	void unownedVenueIsHiddenFailClosed() {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('viscat orphan venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR') RETURNING id
				""").query(Long.class).single();

		assertFalse(listedByName("viscat orphan venue"));
		assertTrue(catalog.findVenueMap(new VenueId(id), tomorrow()).isEmpty());
	}
}
