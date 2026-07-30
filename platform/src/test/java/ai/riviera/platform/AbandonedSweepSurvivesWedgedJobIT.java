package ai.riviera.platform;

import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.TaskScheduler;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.refund.ExpireAbandonedBookings;
import ai.riviera.platform.booking.application.request.RequestWindows;
import ai.riviera.platform.customer.application.AccountErasureStore;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The property #395 exists for, end to end: <strong>a scheduled job that is stuck right now cannot
 * stop the abandoned-payment sweep from releasing an availability claim.</strong>
 *
 * <p>The two sibling tests each prove one instrument in isolation —
 * {@code ScheduledWorkArchitectureTest} that the committed pool covers every job,
 * {@code ScheduledQueryTimeoutIT} that each entry query is bounded. Neither proves the thing the
 * issue actually asked for, because they cannot: a bounded query still owns the only thread for the
 * length of its bound, and a big pool still lets a job wedge forever. This test runs both jobs on
 * the platform's <em>real</em> {@link TaskScheduler} and watches one of them finish while the other
 * is still blocked.
 *
 * <p><strong>The timeout is set high on purpose.</strong> At the production default the wedge would
 * clear after ten seconds and the sweep could simply be waiting its turn — the test would pass with
 * a pool of one and prove nothing. Two minutes is far longer than the test's own patience, so a pass
 * can only mean the sweep got a thread of its own.
 *
 * <p><strong>Why {@code customer} is the locked table.</strong> The obvious wedge, the outbox gauge's
 * {@code event_publication} read, is the one table this test may not lock: the sweep cancels a
 * booking, and the {@code BookingCancelled} publication inserts a row there inside the sweep's own
 * transaction — so locking it would wedge the sweep too and the test would fail for a reason that has
 * nothing to do with threads. Locking {@code customer} wedges the retention sweep's candidate read,
 * which is genuinely "an unrelated sweep's query" and which the abandoned-payment path never touches.
 *
 * <p>The wedged job is the retention sweep's <em>read</em> rather than {@code ExpireGuestContacts}
 * itself, deliberately: the real sweep would proceed to tombstone whatever it selected once the lock
 * released, and this test shares its database with every other IT in the suite.
 *
 * <p>Run against a pool of one, this fails at {@code swept.get(...)} — which is how it was verified
 * to be non-vacuous before the pool size was raised.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		// Far beyond this test's patience, so the wedge cannot clear on its own (see the Javadoc).
		"riviera.scheduled.query-timeout-seconds=120",
		// Long initial delays keep the platform's own sweeps off the pool this test dispatches onto.
		"booking.request.initial-delay=PT30M",
		"booking.awaiting-payment.initial-delay=PT30M",
		"customer.retention.initial-delay=PT30M",
		"riviera.observability.alert.initial-delay=PT30M" })
class AbandonedSweepSurvivesWedgedJobIT {

	private static final Duration TTL = Duration.ofMinutes(15);
	private static final RequestWindows WINDOWS = new RequestWindows(Duration.ofHours(24), Duration.ofHours(12));
	private static final int STALE_AGE_MINUTES = 60;
	private static final LocalDate BOOKING_DATE = LocalDate.of(2027, 9, 14);
	private static final String CODE = "WEDGED001";

	/** Generous for a sweep of a one-row candidate set; far below the 120 s wedge. */
	private static final long SWEEP_MUST_FINISH_WITHIN_SECONDS = 30;

	@Autowired
	TaskScheduler taskScheduler;

	@Autowired
	ExpireAbandonedBookings abandonedSweep;

	@Autowired
	AccountErasureStore erasure;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	DataSource dataSource;

	@BeforeEach
	void isolate() {
		// The sweep scans the whole table and the container is shared; booking before customer (FK).
		jdbc.sql("DELETE FROM set_availability WHERE booking_date = :date").param("date", BOOKING_DATE).update();
		jdbc.sql("DELETE FROM booking WHERE code = :code").param("code", CODE).update();
		jdbc.sql("DELETE FROM customer WHERE email = :email").param("email", CODE + "@example.com").update();
	}

	@Test
	void theAbandonedSweepStillReleasesItsClaimWhileAnotherJobIsWedged() throws Exception {
		SetRef set = onlineSet();
		insertStaleAwaitingPaymentBooking(set);
		claim(set);
		assertThat(availabilityRows(set)).as("precondition: the set is claimed").isEqualTo(1L);

		try (Connection blocker = dataSource.getConnection()) {
			blocker.setAutoCommit(false);
			try (Statement lock = blocker.createStatement()) {
				lock.execute("LOCK TABLE customer IN ACCESS EXCLUSIVE MODE");
			}

			CountDownLatch wedgeRunning = new CountDownLatch(1);
			taskScheduler.schedule(() -> {
				wedgeRunning.countDown();
				erasure.expiredGuestCandidates(Instant.now(), 100);
			}, Instant.now());
			assertThat(wedgeRunning.await(SWEEP_MUST_FINISH_WITHIN_SECONDS, TimeUnit.SECONDS))
					.as("the wedged job must actually be occupying a scheduler thread before we measure")
					.isTrue();

			CompletableFuture<Integer> swept = new CompletableFuture<>();
			taskScheduler.schedule(() -> {
				try {
					swept.complete(abandonedSweep.sweep(TTL, WINDOWS));
				}
				catch (RuntimeException e) {
					swept.completeExceptionally(e);
				}
			}, Instant.now());

			assertThat(swept.get(SWEEP_MUST_FINISH_WITHIN_SECONDS, TimeUnit.SECONDS))
					.as("the abandoned-payment sweep runs to completion while an unrelated scheduled"
							+ " query is still blocked — with one shared thread it would queue behind it")
					.isEqualTo(1);

			blocker.rollback();
		}

		assertThat(availabilityRows(set))
				.as("and it did its actual job: the (set, date) claim is released (invariant #2)")
				.isZero();
		assertThat(availability.claim(new SetId(set.setId()), BOOKING_DATE))
				.as("the released set is genuinely re-claimable, not merely row-deleted")
				.isEqualTo(ClaimOutcome.CLAIMED);
	}

	// --- helpers -----------------------------------------------------------------------------------

	private record SetRef(long setId, long venueId) {
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	/**
	 * A booking past its TTL with <strong>no payment row</strong> — the #125 shape, which the sweep
	 * releases after {@code CancelPaymentPort} reports {@code NoCollection} without any Stripe call.
	 * That keeps this test on the default profile, where the question it asks (does the job get a
	 * thread?) is not entangled with a mocked gateway.
	 */
	private void insertStaleAwaitingPaymentBooking(SetRef set) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:email, 'Guest', '+355600') RETURNING id")
				.param("email", CODE + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, created_at)
				VALUES (:code, :venue, :set, :customer, :date, 4500, 'EUR', 'AWAITING_PAYMENT',
				        NOW() - (:age * INTERVAL '1 minute'))
				""")
				.param("code", CODE)
				.param("venue", set.venueId())
				.param("set", set.setId())
				.param("customer", customer)
				.param("date", BOOKING_DATE)
				.param("age", STALE_AGE_MINUTES)
				.update();
	}

	private void claim(SetRef set) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :date, 'BOOKED_ONLINE')")
				.param("set", set.setId()).param("date", BOOKING_DATE).update();
	}

	private long availabilityRows(SetRef set) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set AND booking_date = :date")
				.param("set", set.setId()).param("date", BOOKING_DATE).query(Long.class).single();
	}
}
