package ai.riviera.platform;

import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import javax.sql.DataSource;

import io.micrometer.core.instrument.MeterRegistry;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.challenge.application.ChallengeRegistry;
import ai.riviera.platform.customer.application.AccountErasureStore;
import ai.riviera.platform.customer.spi.GuestBookingHistory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.shared.ObservabilityMetrics;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every query a {@code @Scheduled} job issues before it starts mutating is <strong>bounded</strong>
 * — the second half of the fix, the first being the thread-per-job isolation
 * {@code ScheduledWorkArchitectureTest} pins.
 *
 * <p>Isolation alone would leave each job free to wedge <em>itself</em> forever: Postgres's default
 * statement timeout is infinite, so a lock wait or a pathological plan has no natural end, and a
 * scheduled job that never returns holds its thread and its pooled connection for the life of the
 * process. The job that matters most is the abandoned-payment sweep — while it is stuck, expired
 * bookings keep their {@code set_availability} claims and those sets stay unsellable, silently and
 * in the safe direction, which is exactly the kind of failure nobody notices.
 *
 * <p><strong>The wedge is real, not simulated.</strong> A second connection takes an
 * {@code ACCESS EXCLUSIVE} lock on the table, which in Postgres blocks even a plain {@code SELECT}.
 * A test that mocked a slow query would prove only that the mock was slow; this proves the driver
 * actually issues the cancel — the part that could silently not work. The shape is
 * {@code SuppressionQueryTimeoutIT}'s, which is where this slice's instrument comes from.
 *
 * <p><strong>Why the read runs on a worker thread.</strong> Holding the lock and reading from one
 * thread would, before the fix, deadlock outright — an unbounded read waiting on a lock this same
 * thread must release. That is a hang, not a red test. Submitting the read to a worker turns the
 * pre-fix behaviour into a {@link TimeoutException} with a message, and the post-fix behaviour into
 * a normal completion well inside the ceiling.
 *
 * <p><strong>More statements than scheduled jobs.</strong> The obvious count is one entry query per
 * scheduled job; it is wrong in both directions. The retention sweep has two — the candidate read
 * against {@code customer} and the retention-basis read against {@code booking} — and both run
 * before it writes anything, so bounding only the first would have left the sweep able to wedge on
 * the second. The no-show sweep has no candidate read at all: its entry statement <em>is</em> its
 * write, a single guarded bulk {@code UPDATE}, and it is bounded on the same client for the same
 * reason. What the rule tracks is each job's first statement, whatever its shape — walk each job's call
 * graph down to its first database round-trip. The challenge sweep is a third shape again: it takes
 * no candidate read and its entry statement is an unguarded {@code DELETE} of already-expired rows,
 * bounded on the same client for the same reason.
 *
 * <p><strong>The lower bound is the non-vacuity guard.</strong> Asserting only "finished within 15 s"
 * would also pass if the read never touched the locked table at all — a test that proves nothing
 * about the wedge. Requiring the read to have taken <em>at least</em> its timeout proves it really
 * blocked and was really cancelled. One second is used here purely for speed; production runs the
 * ten-second default.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"riviera.scheduled.query-timeout-seconds=1",
		// Long initial delays keep the platform's own sweeps out of this lock window.
		"booking.request.initial-delay=PT30M",
		"booking.awaiting-payment.initial-delay=PT30M",
		"customer.retention.initial-delay=PT30M",
		"booking.no-show.initial-delay=PT30M",
		"riviera.observability.alert.initial-delay=PT30M" })
class ScheduledQueryTimeoutIT {

	/** Comfortably above the 1 s bound, far below "hung": a pass here must mean the cancel fired. */
	private static final Duration MUST_STOP_WITHIN = Duration.ofSeconds(15);

	/** Below the 1 s bound the read cannot have blocked on the lock, so the test would be vacuous. */
	private static final Duration MUST_HAVE_BLOCKED_FOR = Duration.ofMillis(900);

	/** Any date: the retention-basis read under test is cancelled long before its result matters. */
	private static final LocalDate SOME_CUTOFF = LocalDate.of(2027, 6, 1);

	/**
	 * The no-show case is the one statement here that <em>writes</em>. Postgres takes the table lock
	 * before scanning, so a cutoff no booking can precede still blocks and still proves the bound —
	 * while making the case incapable of mutating the shared database if it ever completes instead.
	 */
	private static final LocalDate BEFORE_ANY_BOOKING = LocalDate.of(1970, 1, 1);

	@Autowired
	Bookings bookings;

	@Autowired
	AccountErasureStore erasure;

	@Autowired
	ChallengeRegistry challengeRegistry;

	@Autowired
	GuestBookingHistory guestBookingHistory;

	@Autowired
	MeterRegistry meters;

	@Autowired
	DataSource dataSource;

	/**
	 * The outbox-backlog gauge is the alert check's only database access — and the issue that asked
	 * for this slice, along with {@code MoneyPathAlertCheck}'s own Javadoc, said it had none. It reads
	 * the {@code MeterRegistry}, but the gauge's supplier is a {@code SELECT count(*) FROM
	 * event_publication} that Micrometer evaluates <em>at read time, on the calling thread</em>. So the
	 * money-path alarm was not merely a victim of a stalled scheduler; it was a wedge candidate itself,
	 * on the one table a stuck registry listener bloats.
	 */
	@Test
	void aWedgedOutboxGaugeReadAbortsInsteadOfPinningTheSchedulerThread() throws Exception {
		Outcome outcome = readWhileLocked("event_publication",
				() -> meters.find(ObservabilityMetrics.OUTBOX_PENDING).gauge().value());

		assertThat(outcome.elapsed())
				.as("the gauge read must be cut off by its own queryTimeout, not by the lock being released")
				.isBetween(MUST_HAVE_BLOCKED_FOR, MUST_STOP_WITHIN);
	}

	@Test
	void everyScheduledEntryQueryIsBounded() throws Exception {
		Instant now = Instant.now();

		assertBounded("the abandoned-payment sweep's candidate read",
				readWhileLocked("booking", () -> bookings.findExpirableAwaitingPayment(now, now,
						LocalDate.ofInstant(now, ZoneId.of("Europe/Tirane")))));
		assertBounded("the request-expiry sweep's candidate read",
				readWhileLocked("booking", () -> bookings.findOverduePendingRequests(now)));
		assertBounded("the retention sweep's candidate read",
				readWhileLocked("customer", () -> erasure.expiredGuestCandidates(now, 100)));
		assertBounded("the retention sweep's retention-basis read",
				readWhileLocked("booking",
						() -> guestBookingHistory.withBookingOnOrAfter(List.of(new CustomerId(1L)),
								SOME_CUTOFF)));
		assertBounded("the no-show sweep's guarded batch UPDATE",
				readWhileLocked("booking", () -> bookings.markPastConfirmedAsNoShow(BEFORE_ANY_BOOKING, 1)));
		assertBounded("the challenge sweep's expired-row DELETE",
				readWhileLocked("challenge_registry", () -> challengeRegistry.deleteExpiredBefore(now)));
	}

	private static void assertBounded(String what, Outcome outcome) {
		assertThat(outcome.elapsed())
				.as("%s must be cut off by its own queryTimeout, not by the lock being released", what)
				.isBetween(MUST_HAVE_BLOCKED_FOR, MUST_STOP_WITHIN);
		assertThat(outcome.failure())
				.as("%s aborts by surfacing the driver's cancel, so the sweep run fails and retries"
						+ " on the next tick rather than silently selecting nothing", what)
				.isInstanceOf(DataAccessException.class);
	}

	/**
	 * Runs {@code read} on a worker thread while an unrelated connection holds {@code table} under an
	 * {@code ACCESS EXCLUSIVE} lock, and reports how long the read took to stop — by returning or by
	 * throwing. A read that has not stopped within the ceiling fails here, which is the pre-fix state.
	 *
	 * <p>Declaration order matters: try-with-resources closes in reverse, so the connection releases
	 * the lock <em>before</em> {@code ExecutorService#close} waits for the worker. The other order
	 * would wait on a read that nothing has unblocked.
	 */
	private Outcome readWhileLocked(String table, Callable<?> read) throws Exception {
		try (ExecutorService worker = Executors.newSingleThreadExecutor();
				Connection blocker = dataSource.getConnection()) {
			blocker.setAutoCommit(false);
			try (Statement lock = blocker.createStatement()) {
				// A table name cannot be bound; every caller passes a literal from this file.
				lock.execute("LOCK TABLE " + table + " IN ACCESS EXCLUSIVE MODE");
			}

			long startedAt = System.nanoTime();
			Future<?> reading = worker.submit(read);
			Throwable failure = null;
			try {
				reading.get(MUST_STOP_WITHIN.toMillis(), TimeUnit.MILLISECONDS);
			}
			catch (ExecutionException e) {
				failure = e.getCause();
			}
			catch (TimeoutException e) {
				throw new AssertionError("the read on " + table + " was still blocked after "
						+ MUST_STOP_WITHIN + " — it is unbounded, so a wedged query would pin this"
						+ " scheduled job's thread and connection indefinitely (#395)", e);
			}
			Outcome outcome = new Outcome(Duration.ofNanos(System.nanoTime() - startedAt), failure);

			blocker.rollback();
			return outcome;
		}
	}

	/** How long the read took to stop, and how it stopped — {@code null} when it returned normally. */
	private record Outcome(Duration elapsed, Throwable failure) {
	}
}
