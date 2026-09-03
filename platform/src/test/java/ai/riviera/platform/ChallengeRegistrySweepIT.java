package ai.riviera.platform;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The single-use registry through its port on real Postgres: a nonce is claimable exactly once,
 * and the sweep removes rows whose expiry lies more than the clock-skew allowance in the past while
 * leaving live ones and the just-expired ones alone. Driven directly rather than waited for — the
 * scheduler's initial delay keeps the real tick off test windows.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ChallengeRegistrySweepIT {

	private static final String PREFIX = "sweep-it-";

	@Autowired
	ChallengeRegistry registry;
	@Autowired
	ChallengeRegistrySweep sweep;
	@Autowired
	AltchaProperties props;
	@Autowired
	Clock clock;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM challenge_registry WHERE challenge_id LIKE :prefix")
				.param("prefix", PREFIX + "%").update();
	}

	@Test
	void claimsANonceExactlyOnce() {
		Instant expiresAt = clock.instant().plus(Duration.ofMinutes(10));

		assertTrue(registry.claim(PREFIX + "once", expiresAt), "the first claim wins");
		assertFalse(registry.claim(PREFIX + "once", expiresAt), "a replay loses");
	}

	@Test
	void deletesExpiredRowsAndKeepsLiveOnes() {
		Instant now = clock.instant();
		registry.claim(PREFIX + "long-expired", now.minus(Duration.ofHours(1)));
		registry.claim(PREFIX + "just-expired", now.minus(props.clockSkew().dividedBy(2)));
		registry.claim(PREFIX + "live", now.plus(Duration.ofMinutes(10)));

		sweep.sweep();

		assertEquals(0, rows(PREFIX + "long-expired"), "past the skew allowance: swept");
		assertEquals(1, rows(PREFIX + "just-expired"), "inside the skew allowance: still guards a replay");
		assertEquals(1, rows(PREFIX + "live"), "live rows are never touched");
	}

	private int rows(String challengeId) {
		return jdbc.sql("SELECT count(*) FROM challenge_registry WHERE challenge_id = :id")
				.param("id", challengeId).query(Integer.class).single();
	}
}
