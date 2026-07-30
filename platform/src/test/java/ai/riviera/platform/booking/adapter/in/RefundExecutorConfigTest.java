package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import ai.riviera.platform.shared.ObservabilityMetrics;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The saturation contract of the refund executor (#404 AC-7). The pool exists to be a
 * <strong>bulkhead</strong>, so the two properties that make it one are asserted rather than left to a
 * reader of the builder: it is bounded on every axis, and once both are full it <em>sheds</em> — the
 * submission neither throws back at the caller nor runs the task on the caller's thread.
 *
 * <p>Both halves matter and neither is the default. A throw would surface on the thread committing the
 * cancellation (an {@code AFTER_COMMIT} listener is dispatched from inside {@code commit()}), so a
 * cancellation that already succeeded would report a server error; and a caller-runs fallback would put
 * the gateway round-trip on that same thread — the exact defect #404 is about, reached from the other
 * direction.
 *
 * <p><strong>What a shed refund means is not what a shed mail means, and the difference is why the
 * queue is deep.</strong> The mechanism is identical — the submission never runs, so the listener never
 * completes, so the {@code event_publication} row stays outstanding for the next start's republish
 * ({@code RefundBulkheadIT} proves that half against a real registry). What differs is that a shed is
 * the one loss mode that does <strong>not</strong> trigger its own recovery: a crash restarts by
 * definition, a shed happens while the process is healthy. Hence a counter of its own — the outbox
 * alert's threshold is 10, so a single shed refund would never reach it — and a queue sized so that
 * reaching saturation at all takes a burst far larger than one weather-refund sweep.
 *
 * <p>No Spring context — the configuration is exercised as the plain factory it is, standing in for the
 * container's own {@code afterPropertiesSet()} call.
 */
class RefundExecutorConfigTest {

	private static final long RELEASE_TIMEOUT_SECONDS = 10;

	/** The shipped defaults, spelled out rather than read from the record, so a silent retune fails here. */
	private static final RefundExecutorProperties SHIPPED =
			new RefundExecutorProperties(4, 500, Duration.ofSeconds(5));

	/**
	 * One worker, one queue slot — the smallest pool that can saturate, so an episode is reached in
	 * three submissions rather than five hundred and every boundary stays deterministic.
	 */
	private static final RefundExecutorProperties TINY =
			new RefundExecutorProperties(1, 1, Duration.ofSeconds(5));

	/** Short enough that a test can watch the window expire; the shipped one is five seconds. */
	private static final Duration TINY_DRAIN = Duration.ofSeconds(1);

	private static final int SHED_REFUNDS = 5;

	private final MeterRegistry meters = new SimpleMeterRegistry();
	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private ch.qos.logback.classic.Logger configLogger;

	@BeforeEach
	void captureLogs() {
		logs.start();
		configLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(RefundExecutorConfig.class);
		configLogger.addAppender(logs);
	}

	@AfterEach
	void releaseLogs() {
		configLogger.detachAppender(logs);
		logs.stop();
	}

	private ThreadPoolTaskExecutor initializedExecutor(RefundExecutorProperties props) {
		ThreadPoolTaskExecutor pool = new RefundExecutorConfig().bookingRefundExecutor(props, meters);
		pool.afterPropertiesSet();
		return pool;
	}

	private double shedCount() {
		return meters.counter(ObservabilityMetrics.REFUNDS_SHED).count();
	}

	private long escalations() {
		return logs.list.stream().filter(event -> event.getLevel() == Level.ERROR).count();
	}

	/**
	 * Every line the config logged, at any level. The throttle is about <em>volume</em>, so asserting
	 * only the ERROR count would stay green if a future change re-added a per-shed line at WARN beside
	 * the throttled one — the flood would be back with the throttle's test none the wiser.
	 */
	private int logLines() {
		return logs.list.size();
	}

	/** Occupies a worker thread until {@code gate} opens, signalling {@code running} once it holds one. */
	private static Runnable wedge(CountDownLatch running, CountDownLatch gate) {
		return () -> {
			running.countDown();
			awaitQuietly(gate);
		};
	}

	/**
	 * Drive a {@link #TINY} pool into saturation: wedge its single worker, fill its single queue slot
	 * with {@code queued}, then submit {@code sheds} more refunds, every one of which must be rejected.
	 * Returns the gate that releases the worker — the caller opens it to end the episode.
	 */
	private CountDownLatch saturate(ThreadPoolTaskExecutor pool, Runnable queued, int sheds)
			throws InterruptedException {
		CountDownLatch gate = new CountDownLatch(1);
		CountDownLatch running = new CountDownLatch(1);

		pool.execute(wedge(running, gate));
		assertTrue(running.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS),
				"the worker must be occupied before the pool is pushed past capacity");
		pool.execute(queued);

		for (int i = 0; i < sheds; i++) {
			pool.execute(() -> { });
		}
		return gate;
	}

	@Test
	void isBoundedOnEveryAxis() {
		ThreadPoolTaskExecutor pool = initializedExecutor(SHIPPED);
		try {
			assertEquals(SHIPPED.poolSize(), pool.getCorePoolSize());
			assertEquals(SHIPPED.poolSize(), pool.getMaxPoolSize(),
					"max must equal core: a ThreadPoolExecutor grows past core only once the queue is "
							+ "full, so a larger max would add no headroom until the queue already had");
			assertEquals(SHIPPED.queueCapacity(), pool.getQueueCapacity(),
					"an unbounded queue is what makes a degraded gateway a starvation source");
		}
		finally {
			pool.shutdown();
		}
	}

	@Test
	void runsRefundsOnItsOwnThreadsNotTheCallers() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(SHIPPED);
		CountDownLatch ran = new CountDownLatch(1);
		List<String> threadName = new ArrayList<>();

		try {
			pool.execute(() -> {
				threadName.add(Thread.currentThread().getName());
				ran.countDown();
			});

			assertTrue(ran.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS), "the refund never ran");
			assertTrue(threadName.getFirst().startsWith(RefundExecutorConfig.THREAD_NAME_PREFIX),
					"a refund must be identifiable in a thread dump as a refund, not as a generic task");
		}
		finally {
			pool.shutdown();
		}
	}

	@Test
	void shedsOnSaturationWithoutThrowingOrRunningOnTheCallerThread() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		CountDownLatch gate = new CountDownLatch(1);
		CountDownLatch wedged = new CountDownLatch(TINY.poolSize());
		AtomicBoolean shedTaskRan = new AtomicBoolean();
		List<Future<?>> accepted = new ArrayList<>();

		try {
			int capacity = TINY.poolSize() + TINY.queueCapacity();
			for (int i = 0; i < capacity; i++) {
				accepted.add(pool.submit(() -> {
					wedged.countDown();
					awaitQuietly(gate);
				}));
			}
			assertTrue(wedged.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS),
					"every worker thread should be occupied before the pool is pushed past capacity");

			// The submission a saturated pool must absorb: no exception reaches this thread…
			Future<?> shed = pool.submit(() -> shedTaskRan.set(true));

			assertFalse(shed.isDone(),
					"a shed refund yields a Future that never completes — nothing may ever wait on it");
			assertEquals(capacity, accepted.size());
		}
		finally {
			gate.countDown();
			pool.shutdown();
		}

		// …and the task is dropped rather than deferred: it stays unrun even after the pool drains.
		assertFalse(shedTaskRan.get(),
				"a shed refund must not run on the committing thread, now or later; the registry keeps it");
	}

	@Test
	void everyShedRefundIncrementsTheCounter() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		CountDownLatch gate = new CountDownLatch(1);

		try {
			gate = saturate(pool, () -> { }, SHED_REFUNDS);

			assertEquals(SHED_REFUNDS, shedCount(),
					"a shed refund is the one loss mode that does not trigger its own recovery, and the "
							+ "outbox alert's threshold of 10 would never see a single one — this counter "
							+ "is what makes it alertable");
		}
		finally {
			gate.countDown();
			pool.shutdown();
		}
	}

	@Test
	void aSaturationEpisodeLogsOnceNotOncePerShedRefund() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		CountDownLatch gate = new CountDownLatch(1);

		try {
			gate = saturate(pool, () -> { }, SHED_REFUNDS);

			assertEquals(1, escalations(),
					"a wedged gateway must not turn one incident into one log line per rejected refund; "
							+ "the counter carries the volume, the log carries the event");
			assertEquals(1, logLines(), "and not at some other level either — this is about volume");
			assertEquals(SHED_REFUNDS, shedCount(), "throttling the log must not throttle the counter");
		}
		finally {
			gate.countDown();
			pool.shutdown();
		}
	}

	/**
	 * An episode ends when the queue <em>drains</em>, not when a worker picks something up. Clearing the
	 * flag on every task start would tie the log rate to the pool's drain rate: under saturation each
	 * completed refund frees exactly one slot and the next arrival refills-then-rejects, so a restart
	 * republishing an hour of outstanding refunds would emit hundreds of lines — the flood the throttle
	 * exists to prevent. A capacity of 2 is what makes the distinction observable: one slot frees while
	 * the other stays occupied.
	 */
	@Test
	void drainingATaskWhileTheQueueIsStillBackedUpDoesNotEndTheEpisode() throws Exception {
		ThreadPoolTaskExecutor pool =
				initializedExecutor(new RefundExecutorProperties(1, 2, Duration.ofSeconds(5)));
		CountDownLatch workerGate = new CountDownLatch(1);
		CountDownLatch workerRunning = new CountDownLatch(1);
		CountDownLatch queuedGate = new CountDownLatch(1);
		CountDownLatch queuedRunning = new CountDownLatch(1);

		try {
			pool.execute(wedge(workerRunning, workerGate));
			assertTrue(workerRunning.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS));
			pool.execute(wedge(queuedRunning, queuedGate));
			pool.execute(() -> { });
			pool.execute(() -> { });
			assertEquals(1, escalations(), "the episode opens with one escalated line");

			// The pool makes progress — one task starts — but its queue still holds the other.
			workerGate.countDown();
			assertTrue(queuedRunning.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS));
			pool.execute(() -> { });   // refills the slot the drained task freed
			pool.execute(() -> { });   // shed again, still inside the same episode

			assertEquals(1, escalations(),
					"a drained task is not the end of an incident while the backlog persists");
			assertEquals(2, shedCount(), "every shed still counts, throttled log or not");
		}
		finally {
			workerGate.countDown();
			queuedGate.countDown();
			pool.shutdown();
		}
	}

	@Test
	void aLaterEpisodeLogsAgain() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		CountDownLatch queuedRan = new CountDownLatch(1);
		CountDownLatch firstGate = new CountDownLatch(1);
		CountDownLatch secondGate = new CountDownLatch(1);

		try {
			firstGate = saturate(pool, queuedRan::countDown, 1);
			assertEquals(1, escalations(), "the first episode opens with one escalated line");

			// The queue empties, which is what ends an episode.
			firstGate.countDown();
			assertTrue(queuedRan.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS));

			secondGate = saturate(pool, () -> { }, 1);

			assertEquals(2, escalations(),
					"a throttle that silences a genuinely new incident is worse than the flood it "
							+ "replaced — the flag clears once the backlog is gone");
			assertEquals(2, shedCount(), "the counter keeps counting across episodes; it is what alerts");
		}
		finally {
			firstGate.countDown();
			secondGate.countDown();
			pool.shutdown();
		}
	}

	@Test
	void aRejectionDuringShutdownIsNotCountedOrEscalatedAsSaturation() {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		pool.shutdown();

		pool.execute(() -> { });

		assertEquals(0, shedCount(),
				"a redeploy rejects in-flight refunds from an IDLE pool; counting them would make an "
						+ "'alert on any increase' rule fire on every routine deploy");
		assertEquals(0, escalations(), "and would print a gateway-degradation message for a non-event");
	}

	/**
	 * When the drain window expires Spring <em>gives up</em>: it does not escalate to
	 * {@code shutdownNow()}, so a refund still on a thread is neither interrupted nor waited for.
	 *
	 * <p>The reasoning differs from the mail pool's, and is worth stating because it lands in the same
	 * place for a weaker reason. A refund is idempotency-keyed on the booking id, so a replay after an
	 * interrupt would not move money twice — the duplicate-send argument that governs mail does not
	 * apply. What does apply is simpler: an interrupted refund may have reached the gateway without
	 * {@code markRefunded} having run, and the tidy recovery for that is the republish, which is exactly
	 * what leaving the publication outstanding buys. Interrupting adds risk and buys nothing.
	 */
	@Test
	void aRefundOutlastingTheDrainWindowIsAbandonedNotInterrupted() throws Exception {
		ThreadPoolTaskExecutor pool =
				initializedExecutor(new RefundExecutorProperties(4, 500, TINY_DRAIN));
		CountDownLatch running = new CountDownLatch(1);
		CountDownLatch gate = new CountDownLatch(1);
		AtomicBoolean interrupted = new AtomicBoolean();
		AtomicBoolean completed = new AtomicBoolean();

		pool.execute(() -> {
			running.countDown();
			try {
				gate.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
				completed.set(true);
			}
			catch (InterruptedException e) {
				interrupted.set(true);
				Thread.currentThread().interrupt();
			}
		});
		assertTrue(running.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS),
				"the refund must be on a thread before the pool is shut down");

		pool.shutdown();

		assertFalse(completed.get(),
				"the refund must not have finished — an unfinished listener is what leaves the event "
						+ "publication outstanding for the next start's republish");
		assertFalse(interrupted.get(),
				"and it must not be interrupted: the window expiring means give up, never shutdownNow()");
		gate.countDown();
	}

	private static void awaitQuietly(CountDownLatch gate) {
		try {
			gate.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}
}
