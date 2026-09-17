package ai.riviera.platform.venue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.vocabulary.Beach;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the beach-catalogue storage rules (Flyway V59, invariant #12): {@code venue.beach} is
 * one of the catalogue codes — the {@code venue_beach_catalogue_check} CHECK is the DB-level backstop
 * behind the edge parse, and it must accept every {@link Beach} the Java side knows, or a stored
 * code the enum has and the CHECK lacks (or the reverse) would break every read — and the
 * {@code region} column is gone, so a region can only ever be derived from the beach. Runs only
 * when Docker is available (Testcontainers Postgres), against the full Flyway chain.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueBeachCatalogueMigrationIT {

	@Autowired
	JdbcTemplate jdbc;

	private long insertVenue(String beach) {
		return jdbc.queryForObject("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Beach catalogue IT', ?, 'INSTANT', 1500, 'EUR')
				RETURNING id
				""", Long.class, beach);
	}

	@Test
	void rejectsAnOffCatalogueBeach() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertVenue("Ksamil"));
		assertThat(rejected.getMessage()).contains("venue_beach_catalogue_check");
	}

	@Test
	void acceptsEveryCatalogueBeachTheEnumKnows() {
		for (Beach beach : Beach.values()) {
			long id = insertVenue(beach.name());
			jdbc.update("DELETE FROM venue WHERE id = ?", id);
		}
	}

	@Test
	void theRegionColumnIsGone() {
		Integer columns = jdbc.queryForObject("""
				SELECT count(*) FROM information_schema.columns
				 WHERE table_name = 'venue' AND column_name = 'region'
				""", Integer.class);
		assertThat(columns).isZero();
	}

	@Test
	void theSeedVenueWasMappedOntoTheCatalogue() {
		String beach = jdbc.queryForObject(
				"SELECT beach FROM venue WHERE name = 'Miramar Beach Club'", String.class);
		assertThat(beach).isEqualTo("KSAMIL");
	}
}
