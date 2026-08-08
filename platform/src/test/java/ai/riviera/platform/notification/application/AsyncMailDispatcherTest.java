package ai.riviera.platform.notification.application;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import ai.riviera.platform.shared.MdcTaskDecorator;
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
 * Unit spec for the production {@link MailDispatcher}. A recovery-email send must leave the
 * request thread — that inline SMTP round-trip, taken only on the known-email branch, is the timing
 * account-enumeration oracle this slice closes — and it must land on a pool of its OWN, never Boot's shared
 * {@code applicationTaskExecutor}, which carries the Spring Modulith money-path listeners. A dispatch that
 * cannot be accepted is dropped, never thrown at the caller, whose HTTP response the send may not influence
 * (D-8).
 *
 * <p><strong>This slice added the drop's accounting, and its tests are asymmetric with the registry vehicle's on
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
	/**
	 * The sends left in the queue at shutdown, <strong>deliberately not all the same flow</strong>.
	 * The drain path is the one that has to read the kind back off a task queued earlier rather than learn
	 * it from the call happening right now, so a single-kind fixture would pass while attributing every
	 * abandonment to whichever kind happened to be hard-coded.
	 */
	private static final List<MailKind> QUEUED_AT_SHUTDOWN =
			List.of(MailKind.PASSWORD_RESET, MailKind.OPERATOR_APPROVED, MailKind.PASSWORD_RESET);

	/** The send that occupies the single drainer while a fixture fills the queue behind it. */
	private static final MailKind WEDGE_KIND = MailKind.VERIFICATION;

	/** The flow the saturation fixtures lose; a second kind is named wherever isolation is the point. */
	private static final MailKind SATURATION_KIND = MailKind.PASSWORD_RESET;

	/** The shipped relay budget, from which this pool's drain window is derived. */
	private static final MailTransportBudget SHIPPED_BUDGET = new MailTransportBudget(Duration.ofMillis(10_000));

	/** A drain window a wedged send cannot possibly fit in, so the queue is still full when it expires. */
	private static final MailTransportBudget TINY_BUDGET = new MailTransportBudget(Duration.ofMillis(200));

	/** How long an abandoned send is given to prove it is gone; it must never run, not merely run late. */
	private static final long DISCARD_GRACE_MILLIS = 300;

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
		return new AsyncMailDispatcher(meters, SHIPPED_BUDGET);
	}

	private double droppedFor(MailKind kind, String reason) {
		Counter counter = meters.find(ObservabilityMetrics.MAIL_RECOVERY_DROPPED)
				.tag(MailKind.TAG, kind.tagValue())
				.tag(AsyncMailDispatcher.REASON_TAG, reason)
				.counter();
		return counter == null ? 0 : counter.count();
	}

	private double droppedFor(String reason) {
		return meters.find(ObservabilityMetrics.MAIL_RECOVERY_DROPPED)
				.tag(AsyncMailDispatcher.REASON_TAG, reason)
				.counters()
				.stream()
				.mapToDouble(Counter::count)
				.sum();
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
	private CountDownLatch saturate(AsyncMailDispatcher dispatcher, MailKind kind, int drops)
			throws InterruptedException {
		CountDownLatch gate = new CountDownLatch(1);
		CountDownLatch running = new CountDownLatch(1);

		dispatcher.dispatch(kind, () -> {
			running.countDown();
			awaitQuietly(gate);
		});
		assertThat(running.await(AWAIT_SECONDS, TimeUnit.SECONDS))
				.as("the single drainer must be occupied before the queue is filled")
				.isTrue();

		for (int i = 0; i < AsyncMailDispatcher.QUEUE_CAPACITY + drops; i++) {
			dispatcher.dispatch(kind, () -> {
			});
		}
		return gate;
	}

	/**
	 * Wedge the single drainer and queue one send per element of {@code queued}, each counting {@code ran} down if it
	 * ever executes. The wedge is confirmed <em>running</em> first, or it would still be occupying one of the
	 * queue slots the caller is counting. Returns the gate that releases it.
	 */
	private CountDownLatch wedgeWithQueuedSends(AsyncMailDispatcher dispatcher, List<MailKind> queued,
			CountDownLatch ran) throws InterruptedException {
		CountDownLatch gate = new CountDownLatch(1);
		CountDownLatch running = new CountDownLatch(1);

		dispatcher.dispatch(WEDGE_KIND, () -> {
			running.countDown();
			awaitQuietly(gate);
		});
		assertThat(running.await(AWAIT_SECONDS, TimeUnit.SECONDS))
				.as("the single drainer must be occupied before the queue is filled")
				.isTrue();

		queued.forEach(kind -> dispatcher.dispatch(kind, ran::countDown));
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
			dispatcher.dispatch(SATURATION_KIND, () -> {
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

		assertThatCode(() -> dispatcher.dispatch(SATURATION_KIND, () -> ran.set(true))).doesNotThrowAnyException();

		assertThat(ran).as("a rejected task must not run — least of all on the caller's thread").isFalse();
	}

	@Test
	void everyDroppedSendIncrementsTheCounter() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();

		try {
			CountDownLatch gate = saturate(dispatcher, SATURATION_KIND, DROPS);
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
	 * Until this slice the drop series carried {@code reason} alone, so a lost approval notice — the
	 * one kind on this vehicle that nobody re-sends (ADR-0011 decision 5) — was
	 * indistinguishable from a lost password reset, and the runbook's remedy ("tell them") depended on
	 * reconciling an unattributed increment against the window's approvals by hand.
	 */
	@Test
	void aSaturatedDropNamesTheFlowItLost() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();

		try {
			CountDownLatch gate = saturate(dispatcher, MailKind.OPERATOR_APPROVED, DROPS);
			gate.countDown();

			assertThat(droppedFor(MailKind.OPERATOR_APPROVED, AsyncMailDispatcher.REASON_SATURATED))
					.as("an approval notice nobody re-sends must be tellable from a reset the user re-requests")
					.isEqualTo(DROPS);
			assertThat(droppedFor(MailKind.PASSWORD_RESET, AsyncMailDispatcher.REASON_SATURATED))
					.as("a flow that lost nothing must not read as having lost something")
					.isZero();
		}
		finally {
			dispatcher.destroy();
		}
	}

	/**
	 * The deliberate divergence from the registry vehicle. Throttling to one line per episode is
	 * right where a durable copy makes the repeats redundant; here each line describes a distinct
	 * unrecoverable loss and carries the correlation id of the request whose user is still waiting.
	 */
	@Test
	void everyDropIsLoggedBecauseEachIsTheOnlyRecordOfALoss() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();

		try {
			CountDownLatch gate = saturate(dispatcher, SATURATION_KIND, DROPS);
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
	 * A redeploy can reject a send from an otherwise idle pool. Unlike the registry vehicle — which
	 * deliberately does not count that, the publication surviving for the next start's republish — here it
	 * is a genuine loss and must be counted, or the counter under-reports what the runbook says it means.
	 * The tag is what keeps it from reading as a degraded relay.
	 */
	@Test
	void aDropDuringShutdownIsCountedButAttributedToTheShutdown() {
		AsyncMailDispatcher dispatcher = dispatcher();
		dispatcher.destroy();

		dispatcher.dispatch(MailKind.OPERATOR_APPROVED, () -> {
		});

		assertThat(droppedFor(MailKind.OPERATOR_APPROVED, AsyncMailDispatcher.REASON_SHUTDOWN))
				.as("a mail lost to a redeploy is still a mail the user will never receive, and the one nobody "
						+ "re-sends has to be tellable from the one the user can re-request")
				.isEqualTo(1);
		assertThat(droppedFor(MailKind.PASSWORD_RESET, AsyncMailDispatcher.REASON_SHUTDOWN))
				.as("a flow that lost nothing must not read as having lost something")
				.isZero();
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
			CountDownLatch gate = saturate(dispatcher, SATURATION_KIND, DROPS);
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
			CountDownLatch gate = saturate(dispatcher, SATURATION_KIND, DROPS);
			gate.countDown();
			dispatcher.destroy();
			dispatcher.dispatch(MailKind.OPERATOR_APPROVED, () -> {
			});

			assertThat(droppedTotal())
					.as("both causes are drops and belong to one series, so a total can be alerted on — and "
							+ "partitioning that series by kind did not double-count it")
					.isEqualTo(DROPS + 1D);
		}
		finally {
			dispatcher.destroy();
		}
	}

	/**
	 * AC-10 for this vehicle. Same decision as the registry pool's — the window is derived
	 * from the relay budget, and when it expires the pool gives up rather than interrupting, because an
	 * interrupt cannot tell a send that already reached the relay from one that has not. What differs is
	 * the consequence: this vehicle has no publication to fall back on (ADR-0011 decision 5), so an
	 * abandoned send is a mail the recipient must ask for again — or, on the approval notice, cannot.
	 *
	 * <p><strong>And it is deliberately not counted</strong>. A send the window catches
	 * <em>running</em> may already have handed the message to the relay — that ambiguity is the whole
	 * reason the pool gives up instead of interrupting — so charging it to
	 * {@link ObservabilityMetrics#MAIL_RECOVERY_DROPPED} would over-report a mail that arrived. Only the
	 * queue, whose sends provably never started, is accounted for.
	 */
	@Test
	void aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher(meters, TINY_BUDGET);
		CountDownLatch running = new CountDownLatch(1);
		CountDownLatch gate = new CountDownLatch(1);
		AtomicBoolean interrupted = new AtomicBoolean();
		AtomicBoolean completed = new AtomicBoolean();

		dispatcher.dispatch(SATURATION_KIND, () -> {
			running.countDown();
			try {
				gate.await(AWAIT_SECONDS, TimeUnit.SECONDS);
				completed.set(true);
			}
			catch (InterruptedException e) {
				interrupted.set(true);
				Thread.currentThread().interrupt();
			}
		});
		assertThat(running.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();

		dispatcher.destroy();

		assertThat(completed).as("the drain window expired, so the send did not finish").isFalse();
		assertThat(interrupted)
				.as("give up, never shutdownNow(): interrupting a send that already handed off to the "
						+ "relay is what turns at-least-once into a duplicate")
				.isFalse();
		assertThat(droppedTotal())
				.as("a send caught running may already have reached the relay, so counting it as lost "
						+ "would over-report a mail that arrived")
				.isZero();
		gate.countDown();
	}

	/**
	 * This slice's hard half. The two rejection paths learn the kind from the {@code dispatch} call happening
	 * right then; this one has to read it back off a task queued earlier and wrapped by the pool's
	 * {@link MdcTaskDecorator} — which is why a half-tagged series was the risk worth a test of its own.
	 * A {@code kind}-filtered query that silently under-counts is strictly worse than the honest absence
	 * this slice replaced, so the fixture queues <strong>two different flows</strong>: attributing every
	 * abandonment to one hard-coded kind would pass a single-kind spec.
	 */
	@Test
	void anAbandonedSendNamesTheFlowItLost() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher(meters, TINY_BUDGET);
		CountDownLatch ran = new CountDownLatch(QUEUED_AT_SHUTDOWN.size());
		CountDownLatch gate = wedgeWithQueuedSends(dispatcher, QUEUED_AT_SHUTDOWN, ran);

		dispatcher.destroy();

		assertThat(droppedFor(MailKind.PASSWORD_RESET, AsyncMailDispatcher.REASON_ABANDONED))
				.as("each queued send is charged to its own flow, not to whichever one drained first")
				.isEqualTo(QUEUED_AT_SHUTDOWN.stream().filter(MailKind.PASSWORD_RESET::equals).count());
		assertThat(droppedFor(MailKind.OPERATOR_APPROVED, AsyncMailDispatcher.REASON_ABANDONED))
				.as("the notice nobody re-sends is the one an operator most needs this series to name")
				.isEqualTo(QUEUED_AT_SHUTDOWN.stream().filter(MailKind.OPERATOR_APPROVED::equals).count());
		assertThat(droppedFor(WEDGE_KIND, AsyncMailDispatcher.REASON_ABANDONED))
				.as("the send caught running is excluded from this series, so its flow must stay at zero")
				.isZero();

		gate.countDown();
	}

	/**
	 * The fourth loss shape, and the one that moved nothing before this test existed. A send still
	 * <em>queued</em> when the drain window expires is discarded with the pool: {@code execute} returned
	 * normally so neither rejection reason fires, the task never ran so {@code MAIL_RECOVERY_FAILED} cannot,
	 * and this vehicle keeps no durable copy (ADR-0011 decision 5) so {@code riviera.outbox.pending} has
	 * nothing to show either. It rides the existing series' third {@code reason} rather than a fifth metric
	 * name: like both siblings, it is a send the pool never ran.
	 */
	@Test
	void aSendStillQueuedWhenTheDrainWindowExpiresIsCountedAsAbandoned() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher(meters, TINY_BUDGET);
		CountDownLatch ran = new CountDownLatch(QUEUED_AT_SHUTDOWN.size());
		CountDownLatch gate = wedgeWithQueuedSends(dispatcher, QUEUED_AT_SHUTDOWN, ran);

		dispatcher.destroy();

		assertThat(droppedFor(AsyncMailDispatcher.REASON_ABANDONED))
				.as("a send discarded with the pool is as lost as one the pool refused")
				.isEqualTo(QUEUED_AT_SHUTDOWN.size());
		assertThat(droppedFor(AsyncMailDispatcher.REASON_SATURATED))
				.as("a redeploy is not a degraded relay; the alerting reason must not move")
				.isZero();
		assertThat(droppedFor(AsyncMailDispatcher.REASON_SHUTDOWN))
				.as("these were accepted, not rejected — the tag has to tell a deploy's two losses apart")
				.isZero();

		gate.countDown();
		assertThat(ran.await(DISCARD_GRACE_MILLIS, TimeUnit.MILLISECONDS)).isFalse();
		assertThat(ran.getCount())
				.as("the count is only honest if the send was discarded, not counted and then run anyway")
				.isEqualTo(QUEUED_AT_SHUTDOWN.size());
	}

	/**
	 * The other half of the same decision: the drain window exists to <em>deliver</em> these sends, so a
	 * queue that empties inside it is not a loss. Counting at shutdown before the window is awaited would
	 * pass the test above and fail this one.
	 */
	@Test
	void aSendThatDrainsInsideTheWindowIsNotCountedAsAbandoned() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();
		CountDownLatch ran = new CountDownLatch(QUEUED_AT_SHUTDOWN.size());
		CountDownLatch gate = wedgeWithQueuedSends(dispatcher, QUEUED_AT_SHUTDOWN, ran);

		gate.countDown();
		dispatcher.destroy();

		assertThat(ran.await(AWAIT_SECONDS, TimeUnit.SECONDS))
				.as("the shipped window is far longer than three no-op sends need")
				.isTrue();
		assertThat(droppedTotal())
				.as("reporting a delivered mail as lost is the mirror-image error of missing one")
				.isZero();
	}

	/**
	 * The per-loss rule, applied where it needed help to stay true. The line is emitted on the
	 * thread closing the context, not on the request's own, so it carries the correlation id only because
	 * the abandoned task still holds the context it was submitted with. Invariant #7 keeps the address and
	 * the link out, which leaves that id as the only handle on whose mail was lost.
	 */
	@Test
	void everyAbandonedSendIsLoggedOnceUnderItsOwnRequestsContext() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher(meters, TINY_BUDGET);
		MDC.put(CORRELATION_KEY, "corr-1");
		CountDownLatch gate = wedgeWithQueuedSends(dispatcher, QUEUED_AT_SHUTDOWN,
				new CountDownLatch(QUEUED_AT_SHUTDOWN.size()));
		MDC.put(CORRELATION_KEY, "shutdown-thread");

		try {
			dispatcher.destroy();

			assertThat(logs.list)
					.as("one line per loss: there is no durable copy to make a repeat redundant")
					.hasSize(QUEUED_AT_SHUTDOWN.size())
					.allSatisfy(event -> {
						assertThat(event.getLevel())
								.as("a redeploy outrunning the drain is a real loss, but no relay is at fault")
								.isEqualTo(Level.WARN);
						assertThat(event.getMDCPropertyMap())
								.as("the id must be the submitting request's, not the shutdown thread's")
								.containsEntry(CORRELATION_KEY, "corr-1");
						assertThat(event.getFormattedMessage()).doesNotContain("@").doesNotContain("http");
					});
			assertThat(MDC.get(CORRELATION_KEY))
					.as("accounting for a lost mail must not relabel every later shutdown line as that request")
					.isEqualTo("shutdown-thread");
		}
		finally {
			MDC.clear();
			gate.countDown();
		}
	}

	@Test
	void carriesTheCallersLoggingContext() throws Exception {
		AsyncMailDispatcher dispatcher = dispatcher();
		AtomicReference<String> seen = new AtomicReference<>();
		CountDownLatch sent = new CountDownLatch(1);
		MDC.put(CORRELATION_KEY, "corr-1");

		try {
			dispatcher.dispatch(SATURATION_KIND, () -> {
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
			dispatcher.dispatch(SATURATION_KIND, first::countDown);
			MDC.clear();
			assertThat(first.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();

			dispatcher.dispatch(SATURATION_KIND, () -> {
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
