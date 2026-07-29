package ai.riviera.platform.notification.adapter.in;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

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
import org.slf4j.MDC;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
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

	/**
	 * One worker with room to queue — what makes "the next task on the same pooled thread" mean it, so
	 * {@link #aWorkerDoesNotInheritThePreviousTasksContext} cannot pass merely by landing elsewhere.
	 */
	private static final RegistryMailProperties SINGLE_WORKER = new RegistryMailProperties(1, 10);

	private static final int SHED_SENDS = 5;

	private static final String CORRELATION_KEY = "correlationId";

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
		MDC.clear();
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

	/**
	 * Every line the config logged, at any level. AC-6 is about <em>volume</em>, so asserting only the
	 * ERROR count would stay green if a future change re-added a per-shed line at WARN or INFO beside
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
	 * with {@code queued}, then submit {@code sheds} more sends, every one of which must be rejected.
	 * Returns the gate that releases the worker — the caller opens it to end the episode.
	 *
	 * <p>Submissions go through {@code execute}. Production actually reaches the pool via
	 * {@code submit(Callable)} — {@code AsyncExecutionAspectSupport#doSubmit} uses it even for a
	 * {@code void} listener — but both funnel into the same overridden {@code execute} where Spring
	 * applies the {@code TaskDecorator} and {@code ThreadPoolExecutor} consults the rejection handler,
	 * so the counter and episode flag see an identical path. {@code execute} is used here only because
	 * it keeps the tests free of {@code Future}s nothing waits on.
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
		CountDownLatch gate = new CountDownLatch(1);

		try {
			gate = saturate(pool, () -> { }, SHED_SENDS);

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
		CountDownLatch gate = new CountDownLatch(1);

		try {
			gate = saturate(pool, () -> { }, SHED_SENDS);

			assertEquals(1, escalations(),
					"a wedged relay must not turn one incident into one log line per rejected send; "
							+ "the counter carries the volume, the log carries the event");
			assertEquals(1, logLines(), "and not at some other level either — AC-6 is about volume");
			assertEquals(SHED_SENDS, shedCount(), "throttling the log must not throttle the counter");
		}
		finally {
			gate.countDown();
			pool.shutdown();
		}
	}

	/**
	 * The guarantee the docs actually claim, and the one the first cut of #408 did not deliver:
	 * draining a task does <strong>not</strong> end an episode while the queue is still backed up.
	 * Clearing the flag on every task start ties the log rate to the pool's drain rate — a restart
	 * republishing an hour of outstanding sends would emit hundreds of lines, which is the flood the
	 * throttle exists to prevent. A capacity of 2 is what makes the distinction observable: one slot
	 * frees while the other stays occupied.
	 */
	@Test
	void drainingATaskWhileTheQueueIsStillBackedUpDoesNotEndTheEpisode() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(new RegistryMailProperties(1, 2));
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
					"a drained task is not the end of an incident while the backlog persists — the "
							+ "episode ends when the queue empties, not when a worker picks something up");
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
				"a redeploy rejects in-flight sends from an IDLE pool; counting them would make the "
						+ "runbook's 'alert on any increase' fire on every routine deploy");
		assertEquals(0, escalations(), "and would print a relay-degradation message for a non-event");
	}

	/**
	 * AC-1 (#410). Until this pool had a {@code TaskDecorator}, every line emitted from a mail worker
	 * was unattributable: {@code BookingConfirmationMailListener}'s abandoned-confirmation {@code ERROR}
	 * (#428), {@code TransactionalMailService}'s suppression {@code WARN}, and whatever #370's real relay
	 * produces on a transport failure. Invariant #7 keeps the recipient and the arrival code out of those
	 * lines, so the correlation id is the only handle on <em>which</em> send they describe.
	 *
	 * <p>The caller's MDC is cleared before the assertion, so only a copy captured at submit time can
	 * satisfy it — a decorator that read the context on the worker instead would see nothing.
	 */
	@Test
	void aWorkerRunsWithTheSubmittersLoggingContext() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(SHIPPED);
		AtomicReference<String> seen = new AtomicReference<>();
		AtomicReference<String> workerThread = new AtomicReference<>();
		CountDownLatch ran = new CountDownLatch(1);
		MDC.put(CORRELATION_KEY, "corr-1");

		try {
			pool.execute(() -> {
				seen.set(MDC.get(CORRELATION_KEY));
				workerThread.set(Thread.currentThread().getName());
				ran.countDown();
			});
			MDC.clear();

			assertTrue(ran.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS), "the send never ran");
			assertTrue(workerThread.get().startsWith(RegistryMailExecutorConfig.THREAD_NAME_PREFIX),
					"the send must run on this pool, or the propagation proves nothing");
			assertEquals("corr-1", seen.get(),
					"a worker-thread line is unattributable without the submitter's correlation id");
		}
		finally {
			pool.shutdown();
		}
	}

	/**
	 * AC-2 — the other half of propagation: a carried context must not outlive its own task.
	 *
	 * <p>Both tasks are asserted, not just the second. Checking only that the second saw nothing would
	 * be satisfied by a pool that propagates nothing at all — the state this test was written in — so it
	 * would pass before the fix and keep passing if the decorator were later dropped. Asserting the
	 * first task <em>did</em> see the context is what makes the absence in the second mean "cleared".
	 */
	@Test
	void aWorkerDoesNotInheritThePreviousTasksContext() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(SINGLE_WORKER);
		AtomicReference<String> carried = new AtomicReference<>("never ran");
		AtomicReference<String> leaked = new AtomicReference<>("never ran");
		CountDownLatch first = new CountDownLatch(1);
		CountDownLatch second = new CountDownLatch(1);

		try {
			MDC.put(CORRELATION_KEY, "corr-1");
			pool.execute(() -> {
				carried.set(MDC.get(CORRELATION_KEY));
				first.countDown();
			});
			MDC.clear();
			assertTrue(first.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS));

			pool.execute(() -> {
				leaked.set(MDC.get(CORRELATION_KEY));
				second.countDown();
			});

			assertTrue(second.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS));
			assertEquals("corr-1", carried.get(), "propagation must be on for the absence below to mean anything");
			assertNull(leaked.get(),
					"one booking's correlation id must not label the next booking's confirmation mail");
		}
		finally {
			pool.shutdown();
		}
	}

	/**
	 * AC-3 (#410) — the claim the shed comment makes, asserted rather than assumed.
	 *
	 * <p>It holds for a different reason than the worker-side lines above:
	 * {@code ThreadPoolExecutor.execute} calls {@code reject(...)} on the <strong>calling</strong>
	 * thread, which in production is the thread committing the booking transaction (an
	 * {@code AFTER_COMMIT} listener is dispatched from inside {@code commit()}), and that thread does
	 * carry {@code CorrelationIdFilter}'s context. So the escalated line was already attributable and
	 * the {@code TaskDecorator} is not what makes it so — which is exactly why it is pinned here: the
	 * property is load-bearing (invariant #7 leaves nothing else in the line to identify the send by)
	 * and nothing else would notice it breaking.
	 */
	@Test
	void theShedLineIsAttributableToTheSubmittingRequest() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
		CountDownLatch gate = new CountDownLatch(1);
		MDC.put(CORRELATION_KEY, "corr-1");

		try {
			gate = saturate(pool, () -> { }, SHED_SENDS);

			ILoggingEvent escalated = logs.list.stream()
					.filter(event -> event.getLevel() == Level.ERROR)
					.findFirst()
					.orElseThrow();
			assertEquals("corr-1", escalated.getMDCPropertyMap().get(CORRELATION_KEY),
					"a shed warning that cannot be tied to a request tells you a mail was dropped, "
							+ "not whose");
			assertFalse(escalated.getFormattedMessage().contains("@"),
					"the recipient is never in the line (invariant #7)");
			assertFalse(escalated.getFormattedMessage().contains("http"),
					"and neither is a link");
		}
		finally {
			gate.countDown();
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
