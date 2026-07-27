package ai.riviera.platform.notification.adapter.out;

import java.time.Instant;

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
 * The suppression list against real Postgres (#382, AC-4 substrate): the V32 {@code email_suppression}
 * table plus the {@code JdbcEmailSuppressions} adapter behind the {@link EmailSuppressions} port.
 * Pins the pieces the unit tests cannot: the unique-email upsert ({@code ON CONFLICT} refreshes
 * reason + {@code last_event_at}, keeps {@code first_suppressed_at}), and the normalization contract
 * — matching is on the trimmed, lower-cased address on <em>both</em> the write and the read, the
 * same canonical form the {@code customer} module stores (so a feed writing {@code Foo@Bar.com}
 * still suppresses the checkout's {@code foo@bar.com}). Unique addresses per test method against
 * the shared container; suppressions are deliberately never deleted (the table is a do-not-mail
 * record), so no cleanup.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class EmailSuppressionIT {

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	JdbcClient jdbc;

	@Test
	void anUnknownAddressIsNotSuppressed() {
		assertThat(suppressions.isSuppressed("never-suppressed@example.com")).isFalse();
	}

	@Test
	void aSuppressedAddressIsFoundInAnyCasing() {
		suppressions.suppress("  Case-Mixed@Example.COM ", SuppressionReason.COMPLAINT,
				Instant.parse("2026-07-27T10:00:00Z"));

		assertThat(suppressions.isSuppressed("case-mixed@example.com")).isTrue();
		assertThat(suppressions.isSuppressed("CASE-MIXED@example.com  ")).isTrue();
	}

	@Test
	void reSuppressingUpsertsReasonAndLastEventKeepingFirstSuppressedAt() {
		String email = "resuppressed@example.com";
		Instant first = Instant.parse("2026-07-27T10:00:00Z");
		Instant later = Instant.parse("2026-07-28T09:30:00Z");

		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, first);
		suppressions.suppress(email, SuppressionReason.COMPLAINT, later);

		var row = jdbc.sql("SELECT reason, first_suppressed_at, last_event_at "
						+ "FROM email_suppression WHERE email = :email")
				.param("email", email)
				.query((rs, n) -> new Object[] { rs.getString("reason"),
						rs.getTimestamp("first_suppressed_at").toInstant(),
						rs.getTimestamp("last_event_at").toInstant() })
				.single();
		assertThat(row[0]).isEqualTo("COMPLAINT");
		assertThat(row[1]).isEqualTo(first);
		assertThat(row[2]).isEqualTo(later);
	}
}
