package ai.riviera.platform;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * {@link ChallengeRegistry} on the {@code challenge_registry} table (V49). The claim is one
 * {@code INSERT … ON CONFLICT DO NOTHING}, so two concurrent submissions of one solution race on the
 * primary key and exactly one inserts (the invariant-#2 idiom). The sweep's delete runs on a
 * {@link JdbcClient} of this adapter's own with a finite query timeout
 * ({@code riviera.scheduled.query-timeout-seconds}), the bound every scheduled job's entry statement
 * carries; the claim stays on the shared client so a request-thread write is never cut short.
 */
@Component
class JdbcChallengeRegistry implements ChallengeRegistry {

	private final JdbcClient jdbc;
	private final JdbcClient sweepJdbc;

	JdbcChallengeRegistry(JdbcClient jdbc, DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int scheduledQueryTimeoutSeconds) {
		this.jdbc = jdbc;
		this.sweepJdbc = boundedClient(dataSource, scheduledQueryTimeoutSeconds);
	}

	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		return JdbcClient.create(bounded);
	}

	@Override
	public boolean claim(String challengeId, Instant expiresAt) {
		int inserted = jdbc.sql("""
				INSERT INTO challenge_registry (challenge_id, expires_at)
				VALUES (:id, :expiresAt)
				ON CONFLICT (challenge_id) DO NOTHING
				""")
				.param("id", challengeId)
				.param("expiresAt", OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC))
				.update();
		return inserted == 1;
	}

	@Override
	public int deleteExpiredBefore(Instant cutoff) {
		return sweepJdbc.sql("DELETE FROM challenge_registry WHERE expires_at < :cutoff")
				.param("cutoff", OffsetDateTime.ofInstant(cutoff, ZoneOffset.UTC))
				.update();
	}
}
