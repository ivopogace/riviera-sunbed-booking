package ai.riviera.platform.notification.application;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import ai.riviera.platform.shared.ObservabilityMetrics;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Unit spec for the production {@link MailDispatcher} (#369, #415). A recovery-email send must leave the
 * request thread — that inline SMTP round-trip, taken only on the known-email branch, is the timing
 * account-enumeration oracle this slice closes — and it must land on a pool of its OWN, never Boot's shared
 * {@code applicationTaskExecutor}, which carries the Spring Modulith money-path listeners. A dispatch that
 * cannot be accepted is dropped, never thrown at the caller, whose HTTP response the send may not influence
 * (D-8).
 *
 * <p><strong>#415 added the drop's accounting, and its tests are asymmetric with the registry vehicle's on
 * purpose.</strong> {@code RegistryMailExecutorConfigTest} asserts that a saturation episode logs <em>once</em>;
 * here {@code everyDropIsLoggedBecauseEachIsTheOnlyRecordOfALoss} asserts the opposite — one line per drop.
 * That is not an inconsistency to tidy up: a shed send keeps a durable copy (its event publication) so each
 * repeated line is redundant, while a dropped one has none (ADR-0011 decision 5), making the line the only
 * per-loss artefact there is. A future throttle here would turn this test red, which is the point of it.
 */
class AsyncMailDispatcherTest {

	private static final String CORRELATION_KEY = "correlationId";
	private static final int AWAIT_SECONDS = 5;
	private static final int DROPS = 5;

	private final MeterRegistry meters = new SimpleMeterRegistry();
	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private ch.qos.logback.classic.Logger dispatcherLogger;

	@BeforeEach
	void captureLogs() {
		logs.start();
		dispatcherLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(AsyncMailDispatcher.class);
		dispatcherLogger.addAppender(logs);
	}

	@AfterEach
	void releaseLogs() {
		dispatcherLogger.detachAppender(logs);
		logs.stop();
	}

	private AsyncMailDispatcher dispatcher() {
		return new AsyncMailDispatcher(meters);
	}

	private double droppedFor(String reason) {
		Counter counter = meters.find(ObservabilityMetrics.MAIL_RECOVERY_DROPPED)
				.tag(AsyncMailDispatcher.REASON_TAG, reason)
				.counter();
		return counter == null ? 0 : counter.count();
	}

	private double droppedTotal() {
		return meters.find(ObservabilityMetrics.MAIL_RECOVERY_DROPPED)
				.counters()
				.stream()
				.mapToDouble(Counter::count)
				.sum();
	}

	/**
	 * Push the dispatcher past capacity and drop {@code drops} sends. Its single drainer is wedged first —
	 * and the wedge is confirmed <em>running</em> before the queue is filled, or the wedge would still be
	 * sitting in the queue and occupy one of the slots this method is counting. Returns the gate the caller
	 * opens to let the pool drain.
	 */
	private CountDownLatch saturate(AsyncMailDispatcher dispatcher, int drops) throws InterruptedException {
		CountDownLatch gate = new CountDownLatch(1);
		CountDownLatch running = new CountDownLatch(1);

		dispatcher.dispatch(() -> {
			running.countDown();
			awaitQuietly(gate);
		});
		assertThat(running.await(AWAIT_SECONDS, TimeUnit.SECONDS))
				.as("the single drainer must be occupied before the queue is filled")
				.isTrue();

		for (int i = 0; i < AsyncMailDispatcher.QUEUE_CAPACITY + drops; i++) {
			dispatcher.dispatch(() -> {
			});
		}
		return gate;
	}

	private static void awaitQuietly(CountDownLatch gate) {
		try {
			gate.await(AWAIT_SECONDS, TimeUnit.SECONDS);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}

	@Test
	void runsTheSendOffTheCallersThread() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();
		AtomicReference<String> sendThread = new AtomicReference<>();
		CountDownLatch sent = new CountDownLatch(1);

		try {
			dispatcher.dispatch(() -> {
				sendThread.set(Thread.currentThread().getName());
				sent.countDown();
			});

			assertThat(sent.await(AWAIT_SECONDS, TimeUnit.SECONDS)).as("the dispatched send never ran").isTrue();
			assertThat(sendThread.get())
					.as("the send must run on the dedicated recovery-mail pool, not the caller's thread")
					.isNotEqualTo(Thread.currentThread().getName())
					.startsWith("recovery-mail-");
		}
		finally {
			dispatcher.destroy();
		}
	}

	@Test
	void aRejectedDispatchIsDroppedWithoutThrowing() {
		AsyncMailDispatcher dispatcher = dispatcher();
		dispatcher.destroy(); // the executor can no longer accept work
		AtomicBoolean ran = new AtomicBoolean();

		assertThatCode(() -> dispatcher.dispatch(() -> ran.set(true))).doesNotThrowAnyException();

		assertThat(ran).as("a rejected task must not run — least of all on the caller's thread").isFalse();
	}

	@Test
	void everyDroppedSendIncrementsTheCounter() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();

		try {
			CountDownLatch gate = saturate(dispatcher, DROPS);
			gate.countDown();

			assertThat(droppedFor(AsyncMailDispatcher.REASON_SATURATED))
					.as("each send the saturated pool refused is one recovery mail that will never arrive")
					.isEqualTo(DROPS);
		}
		finally {
			dispatcher.destroy();
		}
	}

	/**
	 * The deliberate divergence from the registry vehicle (#415). Throttling to one line per episode is
	 * right where a durable copy makes the repeats redundant; here each line describes a distinct
	 * unrecoverable loss and carries the correlation id of the request whose user is still waiting.
	 */
	@Test
	void everyDropIsLoggedBecauseEachIsTheOnlyRecordOfALoss() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();

		try {
			CountDownLatch gate = saturate(dispatcher, DROPS);
			gate.countDown();

			assertThat(logs.list)
					.as("a per-episode throttle would trade away the only record these losses have")
					.hasSize(DROPS)
					.allMatch(event -> event.getLevel() == Level.ERROR);
		}
		finally {
			dispatcher.destroy();
		}
	}

	/**
	 * A redeploy can reject a send from an otherwise idle pool. Unlike the registry vehicle — where #408
	 * deliberately does not count that, the publication surviving for the next start's republish — here it
	 * is a genuine loss and must be counted, or the counter under-reports what the runbook says it means.
	 * The tag is what keeps it from reading as a degraded relay.
	 */
	@Test
	void aDropDuringShutdownIsCountedButAttributedToTheShutdown() {
		AsyncMailDispatcher dispatcher = dispatcher();
		dispatcher.destroy();

		dispatcher.dispatch(() -> {
		});

		assertThat(droppedFor(AsyncMailDispatcher.REASON_SHUTDOWN))
				.as("a mail lost to a redeploy is still a mail the user will never receive")
				.isEqualTo(1);
		assertThat(droppedFor(AsyncMailDispatcher.REASON_SATURATED))
				.as("a redeploy is not a saturated relay; alerting on saturation must not fire on a deploy")
				.isZero();
		assertThat(logs.list)
				.singleElement()
				.matches(event -> event.getLevel() == Level.WARN,
						"a shutdown race is real loss but no relay is at fault, so it is not an ERROR");
	}

	@Test
	void theDropLineCarriesNeitherAddressNorLink() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();

		try {
			CountDownLatch gate = saturate(dispatcher, DROPS);
			gate.countDown();

			assertThat(logs.list)
					.isNotEmpty()
					.allSatisfy(event -> assertThat(event.getFormattedMessage())
							.as("a recovery mail's address and its tokenized link are both secrets (invariant #7)")
							.doesNotContain("@")
							.doesNotContain("http"));
		}
		finally {
			dispatcher.destroy();
		}
	}

	@Test
	void countsEveryDropUnderTheOneMetricName() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();

		try {
			CountDownLatch gate = saturate(dispatcher, DROPS);
			gate.countDown();
			dispatcher.destroy();
			dispatcher.dispatch(() -> {
			});

			assertThat(droppedTotal())
					.as("both causes are drops and belong to one series, so a total can be alerted on")
					.isEqualTo(DROPS + 1D);
		}
		finally {
			dispatcher.destroy();
		}
	}

	@Test
	void carriesTheCallersLoggingContext() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();
		AtomicReference<String> seen = new AtomicReference<>();
		CountDownLatch sent = new CountDownLatch(1);
		MDC.put(CORRELATION_KEY, "corr-1");

		try {
			dispatcher.dispatch(() -> {
				seen.set(MDC.get(CORRELATION_KEY));
				sent.countDown();
			});

			assertThat(sent.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
			assertThat(seen.get()).as("a failed send must stay traceable to its request").isEqualTo("corr-1");
		}
		finally {
			MDC.clear();
			dispatcher.destroy();
		}
	}

	@Test
	void clearsTheLoggingContextAfterTheTask() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();
		AtomicReference<String> leaked = new AtomicReference<>("never ran");
		CountDownLatch first = new CountDownLatch(1);
		CountDownLatch second = new CountDownLatch(1);

		try {
			MDC.put(CORRELATION_KEY, "corr-1");
			dispatcher.dispatch(first::countDown);
			MDC.clear();
			assertThat(first.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();

			dispatcher.dispatch(() -> {
				leaked.set(MDC.get(CORRELATION_KEY));
				second.countDown();
			});

			assertThat(second.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
			assertThat(leaked.get()).as("the previous task's context leaked onto the pooled thread").isNull();
		}
		finally {
			MDC.clear();
			dispatcher.destroy();
		}
	}
}
