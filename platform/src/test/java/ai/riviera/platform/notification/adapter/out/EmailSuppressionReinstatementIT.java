package ai.riviera.platform.notification.adapter.out;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

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
 * Reinstatement against real Postgres (#391): the V35 {@code reinstated_at} flag, and the three
 * properties the slice's contract change rests on — a reinstated row stops suppressing, a later
 * bounce cleanly re-suppresses it, and <strong>no path ever deletes a row</strong>. That last one is
 * the point of choosing a flag over a {@code DELETE}: ADR-0012's durable-deliverability-record
 * posture survives the amendment, so {@code first_suppressed_at} and the prior {@code reason} live
 * through a reinstate → re-bounce cycle and a reinstatement loop stays visible to ops.
 *
 * <p>Rows are addressed by a <strong>unique per-test {@code domain}</strong> rather than by
 * recomputing the peppered HMAC: the key is deliberately unreadable (#388), and re-deriving it here
 * would duplicate {@code EmailSuppressionIT}'s recomputation for no extra coverage. Suppressions are
 * never deleted, so — as in the sibling IT — there is no cleanup.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class EmailSuppressionReinstatementIT {

	private static final Instant FIRST_EVENT = Instant.parse("2026-07-20T08:31:00Z");
	private static final Instant LIFTED_AT = Instant.parse("2026-07-25T11:14:00Z");
	private static final Instant LATER_EVENT = Instant.parse("2026-07-27T09:30:00Z");

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	JdbcClient jdbc;

	@Test
	void aReinstatedRowIsNoLongerSuppressed() {
		String domain = "lifted.example.com";
		String email = "bounced@" + domain;
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, FIRST_EVENT);
		assertThat(suppressions.isSuppressed(email)).as("the precondition: it starts suppressed").isTrue();

		markReinstated(domain, LIFTED_AT);

		assertThat(suppressions.isSuppressed(email))
				.as("a row flagged reinstated must stop suppressing — the defining invariant tracks "
						+ "the flag, not the row's presence")
				.isFalse();
	}

	@Test
	void aLaterBounceReSuppressesAReinstatedAddress() {
		String domain = "re-bounced.example.com";
		String email = "recovered@" + domain;
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, FIRST_EVENT);
		markReinstated(domain, LIFTED_AT);

		suppressions.suppress(email, SuppressionReason.COMPLAINT, LATER_EVENT);

		assertThat(suppressions.isSuppressed(email)).as("the existing upsert must clear the flag").isTrue();
		assertThat(reinstatedAt(domain)).as("re-suppression clears reinstated_at").isEmpty();
		assertThat(firstSuppressedAt(domain))
				.as("the original first_suppressed_at survives the whole cycle — that is what a flag "
						+ "buys over a DELETE")
				.isEqualTo(FIRST_EVENT);
	}

	@Test
	void reinstatementNeverDeletesTheRow() {
		String domain = "never-deleted.example.com";
		String email = "kept@" + domain;
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, FIRST_EVENT);

		markReinstated(domain, LIFTED_AT);

		assertThat(rowsFor(domain)).as("the deliverability record outlives the reinstatement").isOne();
	}

	/** Stands in for the reinstate write until phase 1 lands it on the port. */
	private void markReinstated(String domain, Instant at) {
		jdbc.sql("UPDATE email_suppression SET reinstated_at = :at WHERE domain = :domain")
				.param("at", Timestamp.from(at))
				.param("domain", domain)
				.update();
	}

	private Optional<Instant> reinstatedAt(String domain) {
		return jdbc.sql("SELECT reinstated_at FROM email_suppression WHERE domain = :domain")
				.param("domain", domain)
				.query((rs, n) -> Optional.ofNullable(rs.getTimestamp("reinstated_at")).map(Timestamp::toInstant))
				.single();
	}

	private Instant firstSuppressedAt(String domain) {
		return jdbc.sql("SELECT first_suppressed_at FROM email_suppression WHERE domain = :domain")
				.param("domain", domain)
				.query((rs, n) -> rs.getTimestamp("first_suppressed_at").toInstant())
				.single();
	}

	private long rowsFor(String domain) {
		return jdbc.sql("SELECT count(*) FROM email_suppression WHERE domain = :domain")
				.param("domain", domain)
				.query(Long.class)
				.single();
	}
}
