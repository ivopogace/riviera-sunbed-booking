package ai.riviera.platform.venue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the venue-profile storage constraints (Flyway V21): amenities are a
 * fixed-catalogue, order-insensitive set stored in the {@code venue_amenity} join table, and
 * {@code distance_to_water_m} is an optional positive integer on {@code venue}. These constraints
 * (invariant #12) are the DB-level backstop behind the application's edge validation — the
 * catalogue {@code CHECK} and the positive-distance {@code CHECK} are created AND tested by the
 * migration, and the join table's composite PK makes the set order-insensitive with no duplicates.
 * Runs only when Docker is available (Testcontainers Postgres), against the full Flyway chain.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueAmenityMigrationIT {

	@Autowired
	JdbcTemplate jdbc;

	/** A fresh, minimal venue so each test isolates the amenity/distance constraint it targets. */
	private long newVenue() {
		return jdbc.queryForObject("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('T7 amenity test', 'Test beach', 'Test region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""", Long.class);
	}

	private void insertAmenity(long venueId, String amenity) {
		jdbc.update("INSERT INTO venue_amenity (venue_id, amenity) VALUES (?, ?)", venueId, amenity);
	}

	@Test
	void rejectsOffCatalogueAmenity() {
		long venueId = newVenue();
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertAmenity(venueId, "PING_PONG"));
		assertThat(rejected.getMessage()).contains("venue_amenity_catalogue_check");
	}

	@Test
	void rejectsZeroDistance() {
		long venueId = newVenue();
		assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
				"UPDATE venue SET distance_to_water_m = 0 WHERE id = ?", venueId)); // positive check
	}

	@Test
	void rejectsNegativeDistance() {
		long venueId = newVenue();
		assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
				"UPDATE venue SET distance_to_water_m = -5 WHERE id = ?", venueId));
	}

	@Test
	void acceptsCatalogueAmenityAndPositiveDistance() {
		long venueId = newVenue();
		insertAmenity(venueId, "BEACH_BAR");
		jdbc.update("UPDATE venue SET distance_to_water_m = 15 WHERE id = ?", venueId);

		Integer amenities = jdbc.queryForObject(
				"SELECT count(*) FROM venue_amenity WHERE venue_id = ?", Integer.class, venueId);
		Integer distance = jdbc.queryForObject(
				"SELECT distance_to_water_m FROM venue WHERE id = ?", Integer.class, venueId);
		assertThat(amenities).isEqualTo(1);
		assertThat(distance).isEqualTo(15);
	}

	@Test
	void rejectsDuplicateAmenityForSameVenue() {
		long venueId = newVenue();
		insertAmenity(venueId, "WIFI");
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertAmenity(venueId, "WIFI")); // composite PK (venue_id, amenity)
		assertThat(rejected).isNotNull();
	}

	@Test
	void deletingVenueCascadesAmenities() {
		long venueId = newVenue();
		insertAmenity(venueId, "CAFE");
		jdbc.update("DELETE FROM venue WHERE id = ?", venueId);

		Integer remaining = jdbc.queryForObject(
				"SELECT count(*) FROM venue_amenity WHERE venue_id = ?", Integer.class, venueId);
		assertThat(remaining).isZero();
	}
}
