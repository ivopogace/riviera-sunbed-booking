package ai.riviera.platform.notification.adapter.out;

import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.notification.application.EmailSuppressions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The suppression lookup is <strong>bounded</strong>. {@code isSuppressed} runs on
 * {@code AsyncMailDispatcher}'s single drainer thread behind a 100-slot queue, and Postgres's default
 * statement timeout is infinite — so before this, one wedged read stalled the entire recovery-mail
 * queue and then silently dropped every new send once the buffer filled. The SMTP half already had
 * finite timeouts; the database half arrived later, with the suppression list, and had none.
 *
 * <p>The wedge here is real rather than simulated: a second connection holds an
 * {@code ACCESS EXCLUSIVE} lock on {@code email_suppression}, which blocks the adapter's {@code SELECT}
 * outright. A test that mocked a slow query would prove only that the mock was slow — this proves the
 * driver actually issues the cancel, which is the part that could silently not work.
 *
 * <p>The timeout is set to one second here purely to keep the test quick; production uses the
 * adapter's two-second default ({@code DEFAULT_QUERY_TIMEOUT_SECONDS}, lowered from five once
 * a request-path caller made it a user-facing latency ceiling). Note what is <em>not</em> asserted:
 * nothing global. The whole point of the design is that {@code spring.jdbc.template.query-timeout}
 * stays unset, so this bound cannot reach {@code availability}'s {@code INSERT … ON CONFLICT} claim,
 * whose loser waits on the winner's index tuple lock (invariant #2).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.notification.suppression-query-timeout-seconds=1")
class SuppressionQueryTimeoutIT {

	/** Comfortably above the 1s timeout, far below "hung": a pass here must mean the cancel fired. */
	private static final Duration MUST_ABORT_WITHIN = Duration.ofSeconds(15);

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	DataSource dataSource;

	@Test
	void aWedgedSuppressionReadAbortsInsteadOfStallingTheDrainerThread() throws Exception {
		try (Connection blocker = dataSource.getConnection()) {
			blocker.setAutoCommit(false);
			try (Statement lock = blocker.createStatement()) {
				lock.execute("LOCK TABLE email_suppression IN ACCESS EXCLUSIVE MODE");
			}

			long startedAt = System.nanoTime();
			assertThatThrownBy(() -> suppressions.isSuppressed("wedged-read@example.com"))
					.as("an unbounded read would block here for as long as the lock is held")
					.isInstanceOf(DataAccessException.class);
			Duration elapsed = Duration.ofNanos(System.nanoTime() - startedAt);

			assertThat(elapsed)
					.as("the read must be cut off by its own queryTimeout, not by the lock being released")
					.isLessThan(MUST_ABORT_WITHIN);

			blocker.rollback();
		}
	}

	@Test
	void anUnobstructedReadIsUnaffectedByTheTimeout() {
		assertThat(suppressions.isSuppressed("not-wedged@example.com")).isFalse();
	}
}
