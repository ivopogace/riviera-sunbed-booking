package ai.riviera.platform;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the V49 migration enforces the single-use rule <em>in the database</em> (invariant
 * #12): {@code challenge_registry.challenge_id} is the primary key, so a second claim of one nonce
 * is rejected outright, and the {@code ON CONFLICT DO NOTHING} form the verifier uses loses quietly
 * with zero rows — the same idiom as the availability claim (invariant #2).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ChallengeRegistryMigrationIT {

	private static final String NONCE = "mig-it-00112233445566778899aabbccddeeff";

	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM challenge_registry WHERE challenge_id LIKE 'mig-it-%'").update();
	}

	@Test
	void primaryKeyRejectsASecondRow() {
		insert(NONCE);

		assertThrows(DataIntegrityViolationException.class, () -> insert(NONCE),
				"challenge_registry(challenge_id) must be unique — a solved challenge is accepted once");
	}

	@Test
	void onConflictDoNothingLosesQuietly() {
		assertEquals(1, claim(NONCE), "the first claim inserts the row");
		assertEquals(0, claim(NONCE), "the second claim must lose without an exception");
	}

	private void insert(String challengeId) {
		jdbc.sql("INSERT INTO challenge_registry (challenge_id, expires_at) VALUES (:id, :expiresAt)")
				.param("id", challengeId)
				.param("expiresAt", tenMinutesAhead())
				.update();
	}

	private int claim(String challengeId) {
		return jdbc.sql("""
				INSERT INTO challenge_registry (challenge_id, expires_at) VALUES (:id, :expiresAt)
				ON CONFLICT (challenge_id) DO NOTHING
				""")
				.param("id", challengeId)
				.param("expiresAt", tenMinutesAhead())
				.update();
	}

	private static OffsetDateTime tenMinutesAhead() {
		return OffsetDateTime.ofInstant(Instant.now().plusSeconds(600), ZoneOffset.UTC);
	}
}
