package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ai.riviera.platform.shared.ResubmissionOutcome;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The sweep-throttle policy of #454 (AC-1, AC-4, AC-5, AC-7), driven at the application boundary
 * against a fake {@link RefundOutbox} and a clock the test moves by hand — the
 * {@code MailResubmissionServiceTest} shape on the money path.
 *
 * <p>What is <em>not</em> under test here is a duplicate refund: the gateway's idempotency key
 * ({@code booking-<id>-refund}) prevents that at the money layer and the registry's per-publication
 * claim one layer down. These tests cover the layer this class does own — how often the whole scope
 * may be swept, and whether a press that achieves nothing says so.
 *
 * <p>Time is injected rather than slept through: the property under test is arithmetic on an
 * {@link Instant}. The one test that genuinely needs two threads — the single-flight race — gets them,
 * because a lock is not observable any other way.
 */
class RefundResubmissionServiceTest {

	private static final Duration COOLDOWN = Duration.ofSeconds(60);

	private static final Instant BOOT = Instant.parse("2026-07-31T09:00:00Z");

	private final MovableClock clock = new MovableClock(BOOT);

	private final RecordingOutbox outbox = new RecordingOutbox();

	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

	private ch.qos.logback.classic.Logger serviceLogger;

	private RefundResubmissionService service;

	@BeforeEach
	void setUp() {
		logs.start();
		serviceLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(RefundResubmissionService.class);
		serviceLogger.addAppender(logs);
		service = new RefundResubmissionService(outbox, new RefundResubmissionWindow(COOLDOWN), clock);
	}

	@AfterEach
	void tearDown() {
		serviceLogger.detachAppender(logs);
		logs.stop();
	}

	/** Past the boot window, so the service under test is accepting. */
	private void settle() {
		clock.advance(COOLDOWN);
	}

	@Test
	@DisplayName("AC-1 — an accepted press re-drives the outbox and reports how many")
	void resubmitsEveryOutstandingRefundPublication() {
		settle();
		outbox.outstanding(3);

		ResubmissionOutcome outcome = service.resubmit();

		assertThat(outcome).isEqualTo(new ResubmissionOutcome.Resubmitted(3, COOLDOWN));
		assertThat(outcome.code()).isEqualTo("RESUBMITTED");
		assertThat(outcome.resubmitted()).isEqualTo(3);
		assertThat(outbox.resubmissions()).isEqualTo(1);
	}

	@Test
	@DisplayName("an empty outbox is an ordinary accepted press, not a refusal")
	void reportsZeroForAnEmptyOutbox() {
		settle();

		assertThat(service.resubmit()).isEqualTo(new ResubmissionOutcome.Resubmitted(0, COOLDOWN));
	}

	@Test
	@DisplayName("AC-4 — a second press inside the cooldown re-drives nothing")
	void refusesASecondInvocationInsideTheCooldown() {
		settle();
		outbox.outstanding(2);
		service.resubmit();

		clock.advance(Duration.ofSeconds(20));
		ResubmissionOutcome outcome = service.resubmit();

		assertThat(outcome).isEqualTo(new ResubmissionOutcome.CoolingDown(Duration.ofSeconds(40)));
		assertThat(outcome.resubmitted()).isZero();
		assertThat(outbox.resubmissions())
				.as("a second sweep would re-ask the gateway for every outstanding refund").isEqualTo(1);
	}

	@Test
	@DisplayName("the lever accepts again once the cooldown has elapsed")
	void acceptsAgainAfterTheCooldown() {
		settle();
		service.resubmit();

		clock.advance(COOLDOWN);

		assertThat(service.resubmit().code()).isEqualTo("RESUBMITTED");
		assertThat(outbox.resubmissions()).isEqualTo(2);
	}

	/**
	 * AC-4's concurrent half. The fake outbox blocks inside {@code resubmitOutstanding} until the
	 * second caller has been answered — the only way to observe the lock rather than the cooldown.
	 */
	@Test
	@DisplayName("AC-4 — a genuinely concurrent press is refused as ALREADY_RUNNING")
	void refusesAConcurrentInvocation() throws Exception {
		settle();
		CountDownLatch inside = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		outbox.blockOn(inside, release);

		try (ExecutorService threads = Executors.newSingleThreadExecutor()) {
			Future<ResubmissionOutcome> first = threads.submit(service::resubmit);
			assertThat(inside.await(5, TimeUnit.SECONDS)).as("the first press reached the outbox").isTrue();

			ResubmissionOutcome second = service.resubmit();

			release.countDown();
			assertThat(first.get(5, TimeUnit.SECONDS).code()).isEqualTo("RESUBMITTED");
			assertThat(second).isEqualTo(new ResubmissionOutcome.AlreadyRunning(COOLDOWN));
			assertThat(outbox.resubmissions()).isEqualTo(1);
		}
	}

	/**
	 * AC-5. {@code republish-outstanding-events-on-restart=true} means the platform has just
	 * resubmitted every outstanding publication itself. A press landing in that window would report
	 * success while moving nothing — #405's R-3, inherited verbatim.
	 */
	@Test
	@DisplayName("AC-5 — the boot republication counts as resubmission zero")
	void startsCoolingDownAtBootSoAClickCannotRaceTheRestartRepublish() {
		outbox.outstanding(4);

		assertThat(service.resubmit()).isEqualTo(new ResubmissionOutcome.CoolingDown(COOLDOWN));
		assertThat(outbox.resubmissions()).isZero();
	}

	/**
	 * AC-7. The line is pinned in full: a count and the fixed text, structurally free of booking ids
	 * and codes (invariant #7) — the payloads that carry them never reach this service.
	 */
	@Test
	@DisplayName("AC-7 — the log line carries a count and no booking identifier")
	void logsACountAndNoBookingIdentifier() {
		settle();
		outbox.outstanding(2);

		service.resubmit();

		assertThat(logs.list).singleElement().satisfies(event -> assertThat(event.getFormattedMessage())
				.isEqualTo("Admin resubmitted 2 outstanding refund publication(s)"));
	}

	@Test
	@DisplayName("a refusal is silent — nothing happened, so nothing is logged")
	void doesNotLogARefusal() {
		service.resubmit();

		assertThat(logs.list).isEmpty();
	}

	@Test
	@DisplayName("the status read reports the outstanding count and the remaining cooldown")
	void reportsTheOutboxStatus() {
		outbox.outstanding(7);

		assertThat(service.status()).isEqualTo(new RefundOutboxStatus(7, COOLDOWN));

		settle();
		assertThat(service.status()).isEqualTo(new RefundOutboxStatus(7, Duration.ZERO));
	}

	/** The status read must not consume the guard — polling admins must eventually see it accept. */
	@Test
	@DisplayName("reading the status neither re-drives nor restarts the cooldown")
	void statusIsARead() {
		settle();

		service.status();
		service.status();

		assertThat(outbox.resubmissions()).isZero();
		assertThat(service.resubmit().code()).isEqualTo("RESUBMITTED");
	}

	/** A {@link RefundOutbox} that counts calls and can be parked mid-resubmission. */
	private static final class RecordingOutbox implements RefundOutbox {

		private final AtomicInteger resubmissions = new AtomicInteger();

		private volatile int outstanding;

		private volatile CountDownLatch entered;

		private volatile CountDownLatch release;

		void outstanding(int count) {
			this.outstanding = count;
		}

		void blockOn(CountDownLatch entered, CountDownLatch release) {
			this.entered = entered;
			this.release = release;
		}

		int resubmissions() {
			return resubmissions.get();
		}

		@Override
		public int countOutstanding() {
			return outstanding;
		}

		@Override
		public int resubmitOutstanding() {
			resubmissions.incrementAndGet();
			if (entered != null) {
				entered.countDown();
				awaitRelease();
			}
			return outstanding;
		}

		private void awaitRelease() {
			try {
				if (!release.await(5, TimeUnit.SECONDS)) {
					throw new IllegalStateException("the test never released the parked resubmission");
				}
			}
			catch (InterruptedException interrupted) {
				Thread.currentThread().interrupt();
				throw new IllegalStateException("interrupted while parked", interrupted);
			}
		}
	}

	/** A {@link Clock} the test advances explicitly, so no cooldown test sleeps. */
	private static final class MovableClock extends Clock {

		private volatile Instant now;

		private MovableClock(Instant now) {
			this.now = now;
		}

		void advance(Duration by) {
			now = now.plus(by);
		}

		@Override
		public ZoneOffset getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			throw new UnsupportedOperationException("the test clock is UTC-only");
		}

		@Override
		public Instant instant() {
			return now;
		}
	}
}
