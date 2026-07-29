package ai.riviera.platform.notification.adapter.in;

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
 * The saturation contract of the registry-mail executor (#383 AC-2). The pool exists to be a
 * <strong>bulkhead</strong>, so the two properties that make it one are asserted rather than left to
 * a reader of the builder: it is <em>bounded</em> on every axis (threads and queue), and once both
 * are full it <em>sheds</em> — the submission neither throws back at the caller nor runs the task on
 * the caller's thread.
 *
 * <p>Both halves of the shed matter and neither is the default. A throw would surface on the thread
 * committing the booking transaction (an {@code AFTER_COMMIT} listener is invoked from inside
 * {@code commit()}), which is the money path this pool exists to protect; and a caller-runs fallback
 * would put the SMTP round-trip on that same thread — the exact failure #383 is about, arrived at
 * from the other direction. The shed work is not lost: its Event Publication Registry row is still
 * outstanding, so the next restart republishes it.
 *
 * <p>No Spring context — the configuration is exercised as the plain factory it is, standing in for
 * the container's own {@code afterPropertiesSet()} call.
 */
class RegistryMailExecutorConfigTest {

	private static final long RELEASE_TIMEOUT_SECONDS = 10;

	/** The shipped defaults, spelled out — #408 made them properties, so nothing asserts them by identity. */
	private static final RegistryMailProperties SHIPPED = new RegistryMailProperties(2, 200);

	/**
	 * One thread, one queue slot — the smallest pool that can saturate, so an episode is reached in
	 * three submissions rather than two hundred and every boundary in it stays deterministic.
	 */
	private static final RegistryMailProperties TINY = new RegistryMailProperties(1, 1);

	private static final int SHED_SENDS = 5;

	private final MeterRegistry meters = new SimpleMeterRegistry();
	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private ch.qos.logback.classic.Logger configLogger;

	@BeforeEach
	void captureLogs() {
		logs.start();
		configLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(RegistryMailExecutorConfig.class);
		configLogger.addAppender(logs);
	}

	@AfterEach
	void releaseLogs() {
		configLogger.detachAppender(logs);
		logs.stop();
	}

	private ThreadPoolTaskExecutor initializedExecutor(RegistryMailProperties props) {
		ThreadPoolTaskExecutor pool = new RegistryMailExecutorConfig().registryMailExecutor(props, meters);
		pool.afterPropertiesSet();
		return pool;
	}

	private double shedCount() {
		return meters.counter(ObservabilityMetrics.MAIL_REGISTRY_SHED).count();
	}

	private long escalations() {
		return logs.list.stream().filter(event -> event.getLevel() == Level.ERROR).count();
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
	 * with {@code queued}, then submit {@code sheds} more sends, every one of which must be rejected.
	 * Returns the gate that releases the worker — the caller opens it to end the episode.
	 *
	 * <p>Submissions go through {@code execute}, not {@code submit}, because that is the path
	 * {@code @Async} takes for the {@code void} listener method this pool actually carries.
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
					"an unbounded queue is what makes a degraded relay a starvation source");
		}
		finally {
			pool.shutdown();
		}
	}

	@Test
	void shedsOnSaturationWithoutThrowingOrRunningOnTheCallerThread() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(SHIPPED);
		CountDownLatch gate = new CountDownLatch(1);
		CountDownLatch wedged = new CountDownLatch(SHIPPED.poolSize());
		AtomicBoolean shedTaskRan = new AtomicBoolean();
		List<Future<?>> accepted = new ArrayList<>();

		try {
			int capacity = SHIPPED.poolSize() + SHIPPED.queueCapacity();
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
					"a shed task yields a Future that never completes — nothing may ever wait on it");
			assertEquals(capacity, accepted.size());
		}
		finally {
			gate.countDown();
			pool.shutdown();
		}

		// …and the task is dropped rather than deferred: it stays unrun even after the pool drains.
		assertFalse(shedTaskRan.get(),
				"a shed send must not run on the caller's thread, now or later; the registry keeps the work");
	}

	@Test
	void everyShedSendIncrementsTheCounter() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		CountDownLatch gate = saturate(pool, () -> { }, SHED_SENDS);

		try {
			assertEquals(SHED_SENDS, shedCount(),
					"the shed path must be attributable: one increment per send that never reached the "
							+ "relay, so 'how often did we shed?' is answerable without grepping logs");
		}
		finally {
			gate.countDown();
			pool.shutdown();
		}
	}

	@Test
	void aSaturationEpisodeLogsOnceNotOncePerShedTask() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		CountDownLatch gate = saturate(pool, () -> { }, SHED_SENDS);

		try {
			assertEquals(1, escalations(),
					"a wedged relay must not turn one incident into one log line per rejected send; "
							+ "the counter carries the volume, the log carries the event");
			assertEquals(SHED_SENDS, shedCount(), "throttling the log must not throttle the counter");
		}
		finally {
			gate.countDown();
			pool.shutdown();
		}
	}

	@Test
	void aLaterEpisodeLogsAgain() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		CountDownLatch queuedRan = new CountDownLatch(1);
		CountDownLatch firstGate = saturate(pool, queuedRan::countDown, 1);
		CountDownLatch secondGate = null;

		try {
			assertEquals(1, escalations(), "the first episode opens with one escalated line");

			// The pool makes progress, which is what ends an episode.
			firstGate.countDown();
			assertTrue(queuedRan.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS));

			secondGate = saturate(pool, () -> { }, 1);

			assertEquals(2, escalations(),
					"a throttle that silences a genuinely new incident is worse than the flood it "
							+ "replaced — the flag clears as soon as the pool drains a task");
		}
		finally {
			firstGate.countDown();
			if (secondGate != null) {
				secondGate.countDown();
			}
			pool.shutdown();
		}
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
