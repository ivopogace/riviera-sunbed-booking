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
 * Verifies Flyway V86: the nullable venue phone and its E.164 CHECK, the backstop behind
 * {@code VenuePhone}. Runs only when Docker is available, against the full Flyway chain incl. the seed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenuePhoneMigrationIT {

	private static final long MIRAMAR = 1L;
	private static final String READ = "SELECT phone FROM venue WHERE id = ?";

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void existingVenuesHaveNoPhone() {
		assertThat(jdbc.queryForObject(READ, String.class, MIRAMAR)).isNull();
	}

	@Test
	void onlyE164OrNullIsStored() {
		for (String bad : new String[] { "+355 69 123 4567", "355691234567", "+0355691234567", "+1234567",
				"+1234567890123456" }) {
			DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
					() -> jdbc.update("UPDATE venue SET phone = ? WHERE id = ?", bad, MIRAMAR));
			assertThat(rejected.getMessage()).contains("venue_phone_check");
		}

		jdbc.update("UPDATE venue SET phone = '+355691234567' WHERE id = ?", MIRAMAR);
		assertThat(jdbc.queryForObject(READ, String.class, MIRAMAR)).isEqualTo("+355691234567");
		jdbc.update("UPDATE venue SET phone = NULL WHERE id = ?", MIRAMAR);
		assertThat(jdbc.queryForObject(READ, String.class, MIRAMAR)).isNull();
	}
}
