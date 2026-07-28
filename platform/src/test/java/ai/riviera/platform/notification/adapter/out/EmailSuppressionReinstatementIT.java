package ai.riviera.platform.notification.adapter.out;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
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
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.ReinstateOutcome;
import ai.riviera.platform.notification.application.SuppressionReason;
import ai.riviera.platform.notification.application.TransactionalMailService;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Reinstatement against real Postgres (#391): the V35 {@code reinstated_at} flag, the three outcomes
 * {@code reinstate} distinguishes, and the properties the slice's contract change rests on — a
 * reinstated row stops suppressing, a later bounce cleanly re-suppresses it, and <strong>no path ever
 * deletes a row</strong>. That last one is the point of choosing a flag over a {@code DELETE}:
 * ADR-0012's durable-deliverability-record posture survives the amendment, so
 * {@code first_suppressed_at} and the prior {@code reason} live through a reinstate → re-bounce cycle
 * and a reinstatement loop stays visible to ops.
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
	private static final Instant SECOND_LIFT_ATTEMPT = Instant.parse("2026-07-26T16:00:00Z");

	/** Long enough for the losing call to reach the row lock, short enough not to slow the suite. */
	private static final long BLOCKED_HANDOFF_MILLIS = 400;

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	TransactionalMailService mailService;

	@Autowired
	MockMailer mailer;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	DataSource dataSource;

	@Test
	void reinstatingASuppressedAddressLiftsTheSuppression() {
		String email = "bounced@lifted.example.com";
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, FIRST_EVENT);
		assertThat(suppressions.isSuppressed(email)).as("the precondition: it starts suppressed").isTrue();

		ReinstateOutcome outcome = suppressions.reinstate(email, LIFTED_AT);

		assertThat(outcome)
				.as("the admin gets the row's facts back, so the ops workflow needs no second lookup")
				.isEqualTo(new ReinstateOutcome.Reinstated(
						SuppressionReason.HARD_BOUNCE, FIRST_EVENT, FIRST_EVENT));
		assertThat(suppressions.isSuppressed(email))
				.as("the defining invariant tracks the flag, not the row's presence")
				.isFalse();
	}

	@Test
	void reinstatingAnUnknownAddressWritesNothing() {
		String email = "never-listed@unknown.example.com";

		ReinstateOutcome outcome = suppressions.reinstate(email, LIFTED_AT);

		assertThat(outcome).isEqualTo(new ReinstateOutcome.NotSuppressed());
		assertThat(rowsFor("unknown.example.com"))
				.as("reinstating an address that was never listed must not create a row")
				.isZero();
	}

	@Test
	void reinstatingTwiceIsIdempotent() {
		String email = "twice@idempotent.example.com";
		suppressions.suppress(email, SuppressionReason.COMPLAINT, FIRST_EVENT);
		suppressions.reinstate(email, LIFTED_AT);

		ReinstateOutcome outcome = suppressions.reinstate(email, SECOND_LIFT_ATTEMPT);

		assertThat(outcome)
				.as("the second call reports the ORIGINAL lift, and must not move reinstated_at")
				.isEqualTo(new ReinstateOutcome.AlreadyReinstated(
						SuppressionReason.COMPLAINT, FIRST_EVENT, FIRST_EVENT, LIFTED_AT));
		assertThat(reinstatedAt("idempotent.example.com")).hasValue(LIFTED_AT);
	}

	@Test
	void aLaterBounceReSuppressesAReinstatedAddress() {
		String email = "recovered@re-bounced.example.com";
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, FIRST_EVENT);
		suppressions.reinstate(email, LIFTED_AT);

		suppressions.suppress(email, SuppressionReason.COMPLAINT, LATER_EVENT);

		assertThat(suppressions.isSuppressed(email)).as("the existing upsert must clear the flag").isTrue();
		assertThat(reinstatedAt("re-bounced.example.com")).as("re-suppression clears reinstated_at").isEmpty();
		assertThat(firstSuppressedAt("re-bounced.example.com"))
				.as("the original first_suppressed_at survives the whole cycle — that is what a flag "
						+ "buys over a DELETE")
				.isEqualTo(FIRST_EVENT);
	}

	@Test
	void aReinstatedAddressReceivesMailAgain() {
		String email = "recovered@delivers-again.example.com";
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, FIRST_EVENT);
		mailService.sendBookingConfirmation(email, confirmation());
		assertThat(mailer.lastTo(email)).as("the precondition: suppressed mail is withheld").isEmpty();

		suppressions.reinstate(email, LIFTED_AT);
		mailService.sendBookingConfirmation(email, confirmation());

		assertThat(mailer.lastTo(email))
				.as("the whole point of the slice: a reinstated address is mailable again, proven "
						+ "through the real chokepoint rather than a mocked port")
				.isPresent();
	}

	/**
	 * The lift that <em>loses</em> a race reports the winner's instant instead of crashing — the bug the
	 * #398 review found, reproduced deterministically here.
	 *
	 * <p>The first implementation did the lift in one data-modifying CTE, reasoning that its
	 * {@code UPDATE} and its outer {@code SELECT} share a snapshot. They do — until a second writer
	 * holds the row. Under READ COMMITTED the blocked {@code UPDATE} re-checks its {@code WHERE}
	 * against the newest <em>committed</em> version (EvalPlanQual) while the outer {@code SELECT} keeps
	 * the original snapshot, so the loser read "I didn't lift it" together with
	 * {@code reinstated_at IS NULL} — the combination that javadoc called unreachable — and the mapper
	 * dereferenced a null {@code Timestamp}.
	 *
	 * <p><strong>Why the handoff is explicit rather than two racing threads.</strong> A pair of threads
	 * behind a barrier does <em>not</em> reproduce it: each statement commits immediately under
	 * autocommit, so the window where one blocks on the other is vanishingly small — that version of
	 * this test passed against the broken adapter, which is the only reason this one exists. Holding an
	 * uncommitted {@code UPDATE} open makes the lock wait certain: the reinstate call is provably
	 * blocked when the winner commits, which is exactly the state the bug needed.
	 */
	@Test
	void aLiftThatLosesTheRaceReportsTheWinnersInstant() throws Exception {
		String domain = "lock-contended.example.com";
		String email = "racer@" + domain;
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, FIRST_EVENT);

		try (Connection winner = dataSource.getConnection()) {
			winner.setAutoCommit(false);
			liftUncommitted(winner, domain);

			CountDownLatch loserStarted = new CountDownLatch(1);
			try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
				Future<ReinstateOutcome> loser = pool.submit(() -> {
					loserStarted.countDown();
					return suppressions.reinstate(email, SECOND_LIFT_ATTEMPT);
				});

				assertThat(loserStarted.await(5, TimeUnit.SECONDS)).isTrue();
				Thread.sleep(BLOCKED_HANDOFF_MILLIS);
				winner.commit();

				assertThat(loser.get(10, TimeUnit.SECONDS))
						.as("the loser must observe the committed lift, not its own stale snapshot")
						.isEqualTo(new ReinstateOutcome.AlreadyReinstated(
								SuppressionReason.HARD_BOUNCE, FIRST_EVENT, FIRST_EVENT, LIFTED_AT));
			}
		}
		assertThat(reinstatedAt(domain)).as("the winner's instant stands").hasValue(LIFTED_AT);
	}

	/** Lift the row on a connection that keeps the transaction — and therefore the row lock — open. */
	private static void liftUncommitted(Connection winner, String domain) throws SQLException {
		try (PreparedStatement lift = winner.prepareStatement(
				"UPDATE email_suppression SET reinstated_at = ? WHERE domain = ?")) {
			lift.setTimestamp(1, Timestamp.from(LIFTED_AT));
			lift.setString(2, domain);
			lift.executeUpdate();
		}
	}

	@Test
	void noPathEverDeletesARow() {
		String email = "kept@never-deleted.example.com";
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, FIRST_EVENT);

		suppressions.reinstate(email, LIFTED_AT);
		suppressions.reinstate(email, SECOND_LIFT_ATTEMPT);
		suppressions.suppress(email, SuppressionReason.COMPLAINT, LATER_EVENT);

		assertThat(rowsFor("never-deleted.example.com"))
				.as("the deliverability record outlives every reinstatement — ADR-0012 as amended")
				.isOne();
	}

	private static BookingConfirmationMail confirmation() {
		return new BookingConfirmationMail("CODE1234", "Vala Beach", LocalDate.of(2026, 8, 1), "A", 3, 4500, "EUR");
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
