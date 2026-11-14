package ai.riviera.platform.notification.adapter.out;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The upsert's out-of-order guard (#372): the bounce feed is at-least-once and unordered, so an event
 * no newer than the row's reinstatement or last event must not move it. Rows are addressed by a unique
 * per-test {@code domain}, as in {@code EmailSuppressionReinstatementIT}; nothing is ever deleted.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class EmailSuppressionEventOrderIT {

	private static final Instant BOUNCED_AT = Instant.parse("2026-08-02T08:00:00Z");
	private static final Instant LIFTED_AT = Instant.parse("2026-08-04T10:00:00Z");
	private static final Instant COMPLAINED_AT = Instant.parse("2026-08-06T12:00:00Z");

	/** Long enough for the blocked upsert to reach the row lock, short enough not to slow the suite. */
	private static final long BLOCKED_HANDOFF_MILLIS = 400;

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	DataSource dataSource;

	@Test
	void aReplayedBounceDoesNotUndoANewerReinstatement() {
		String email = "replayed@stale-replay.example.com";
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, BOUNCED_AT);
		suppressions.reinstate(email, LIFTED_AT);

		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, BOUNCED_AT);

		assertThat(suppressions.isSuppressed(email))
				.as("a re-delivered bounce the admin already judged must not re-suppress")
				.isFalse();
		assertThat(reinstatedAt("stale-replay.example.com")).hasValue(LIFTED_AT);
	}

	@Test
	void aBounceAtTheLiftInstantIsAlreadyJudged() {
		String email = "tied@lift-instant.example.com";
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, BOUNCED_AT);
		suppressions.reinstate(email, LIFTED_AT);

		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, LIFTED_AT);

		assertThat(suppressions.isSuppressed(email)).isFalse();
	}

	@Test
	void aLateArrivingOlderEventNeverRewindsTheRow() {
		String email = "rewind@older-event.example.com";
		suppressions.suppress(email, SuppressionReason.COMPLAINT, COMPLAINED_AT);

		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, BOUNCED_AT);

		assertThat(reasonOf("older-event.example.com"))
				.as("the newest event's reason stands")
				.isEqualTo("COMPLAINT");
		assertThat(lastEventAt("older-event.example.com")).isEqualTo(COMPLAINED_AT);
	}

	/**
	 * A stale event blocked behind an uncommitted lift must honour it once committed: the upsert's
	 * conflict arm reads the newest committed row, which a snapshot-reading CTE would not. The lift is
	 * held open on its own connection so the wait is certain, not a race (as in the reinstatement IT).
	 */
	@Test
	void aStaleBounceBlockedBehindALiftHonoursItOnceCommitted() throws Exception {
		String domain = "lift-contended.example.com";
		String email = "contended@" + domain;
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, BOUNCED_AT);

		try (Connection lifter = dataSource.getConnection()) {
			lifter.setAutoCommit(false);
			try (PreparedStatement lift = lifter.prepareStatement(
					"UPDATE email_suppression SET reinstated_at = ? WHERE domain = ?")) {
				lift.setTimestamp(1, Timestamp.from(LIFTED_AT));
				lift.setString(2, domain);
				lift.executeUpdate();
			}

			CountDownLatch replayStarted = new CountDownLatch(1);
			try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
				Future<?> replay = pool.submit(() -> {
					replayStarted.countDown();
					suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, BOUNCED_AT);
				});
				assertThat(replayStarted.await(5, TimeUnit.SECONDS)).isTrue();
				Thread.sleep(BLOCKED_HANDOFF_MILLIS);
				lifter.commit();
				replay.get(10, TimeUnit.SECONDS);
			}
		}

		assertThat(reinstatedAt(domain)).as("the committed lift survives the stale replay").hasValue(LIFTED_AT);
		assertThat(suppressions.isSuppressed(email)).isFalse();
	}

	private Optional<Instant> reinstatedAt(String domain) {
		return jdbc.sql("SELECT reinstated_at FROM email_suppression WHERE domain = :domain")
				.param("domain", domain)
				.query((rs, n) -> Optional.ofNullable(rs.getTimestamp("reinstated_at")).map(Timestamp::toInstant))
				.single();
	}

	private String reasonOf(String domain) {
		return jdbc.sql("SELECT reason FROM email_suppression WHERE domain = :domain")
				.param("domain", domain)
				.query(String.class)
				.single();
	}

	private Instant lastEventAt(String domain) {
		return jdbc.sql("SELECT last_event_at FROM email_suppression WHERE domain = :domain")
				.param("domain", domain)
				.query((rs, n) -> rs.getTimestamp("last_event_at").toInstant())
				.single();
	}
}
