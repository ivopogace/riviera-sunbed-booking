package ai.riviera.platform.notification.application;

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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The once-only policy of #405 (AC-1, AC-3, AC-4, AC-7), driven at the application boundary against a
 * fake {@link MailOutbox} and a clock the test moves by hand.
 *
 * <p>Time is injected rather than slept through on purpose: a cooldown test that waits for real
 * seconds is both slow and flaky, and the property under test is arithmetic on an {@link Instant}, not
 * wall-clock behaviour. The one test that genuinely needs two threads — the single-flight race — gets
 * them, because a lock is not observable any other way.
 */
class MailResubmissionServiceTest {

	private static final Duration COOLDOWN = Duration.ofSeconds(60);

	private static final Instant BOOT = Instant.parse("2026-07-30T09:00:00Z");

	private final MovableClock clock = new MovableClock(BOOT);

	private final RecordingOutbox outbox = new RecordingOutbox();

	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

	private ch.qos.logback.classic.Logger serviceLogger;

	private MailResubmissionService service;

	@BeforeEach
	void setUp() {
		logs.start();
		serviceLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(MailResubmissionService.class);
		serviceLogger.addAppender(logs);
		service = new MailResubmissionService(outbox, new MailResubmissionWindow(COOLDOWN), clock);
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
	void resubmitsEveryOutstandingMailPublication() {
		settle();
		outbox.outstanding(3);

		MailResubmissionOutcome outcome = service.resubmit();

		assertThat(outcome).isEqualTo(new MailResubmissionOutcome.Resubmitted(3, COOLDOWN));
		assertThat(outcome.code()).isEqualTo("RESUBMITTED");
		assertThat(outcome.resubmitted()).isEqualTo(3);
		assertThat(outbox.resubmissions()).isEqualTo(1);
	}

	@Test
	@DisplayName("an empty outbox is an ordinary accepted press, not a refusal")
	void reportsZeroForAnEmptyOutbox() {
		settle();

		assertThat(service.resubmit()).isEqualTo(new MailResubmissionOutcome.Resubmitted(0, COOLDOWN));
	}

	@Test
	@DisplayName("AC-3 — a second press inside the cooldown re-drives nothing")
	void refusesASecondInvocationInsideTheCooldown() {
		settle();
		outbox.outstanding(2);
		service.resubmit();

		clock.advance(Duration.ofSeconds(20));
		MailResubmissionOutcome outcome = service.resubmit();

		assertThat(outcome).isEqualTo(new MailResubmissionOutcome.CoolingDown(Duration.ofSeconds(40)));
		assertThat(outcome.resubmitted()).isZero();
		assertThat(outbox.resubmissions()).as("the same rows would have been sent twice").isEqualTo(1);
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
	 * AC-3's concurrent half. The fake outbox blocks inside {@code resubmitOutstanding} until the
	 * second caller has been answered, which is the only way to observe the lock: without it the first
	 * press would finish before the second began and the cooldown — a different guard — would be what
	 * refused.
	 */
	@Test
	@DisplayName("AC-3 — a genuinely concurrent press is refused as ALREADY_RUNNING")
	void refusesAConcurrentInvocation() throws Exception {
		settle();
		CountDownLatch inside = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		outbox.blockOn(inside, release);

		try (ExecutorService threads = Executors.newSingleThreadExecutor()) {
			Future<MailResubmissionOutcome> first = threads.submit(service::resubmit);
			assertThat(inside.await(5, TimeUnit.SECONDS)).as("the first press reached the outbox").isTrue();

			MailResubmissionOutcome second = service.resubmit();

			release.countDown();
			assertThat(first.get(5, TimeUnit.SECONDS).code()).isEqualTo("RESUBMITTED");
			assertThat(second).isEqualTo(new MailResubmissionOutcome.AlreadyRunning(COOLDOWN));
			assertThat(outbox.resubmissions()).isEqualTo(1);
		}
	}

	/**
	 * AC-4. {@code republish-outstanding-events-on-restart=true} means the platform has just resubmitted
	 * every outstanding publication itself, from {@code afterSingletonsInstantiated}. A press landing in
	 * that window is the restart race #405 names, and it is refused for the same reason any other rapid
	 * second press is.
	 */
	@Test
	@DisplayName("AC-4 — the boot republication counts as resubmission zero")
	void startsCoolingDownAtBootSoAClickCannotRaceTheRestartRepublish() {
		outbox.outstanding(4);

		assertThat(service.resubmit()).isEqualTo(new MailResubmissionOutcome.CoolingDown(COOLDOWN));
		assertThat(outbox.resubmissions()).isZero();
	}

	@Test
	@DisplayName("AC-7 — the log line carries a count and no bearer credential")
	void logsACountAndNoBearerCredential() {
		settle();
		outbox.outstanding(2);

		service.resubmit();

		assertThat(logs.list).singleElement().satisfies(event -> {
			assertThat(event.getFormattedMessage()).contains("2");
			assertThat(event.getFormattedMessage()).doesNotContain("@");
		});
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

		assertThat(service.status()).isEqualTo(new MailOutboxStatus(7, COOLDOWN));

		settle();
		assertThat(service.status()).isEqualTo(new MailOutboxStatus(7, Duration.ZERO));
	}

	/**
	 * The status read must not consume the guard — an admin refreshing the console page repeatedly
	 * would otherwise never see the lever accept.
	 */
	@Test
	@DisplayName("reading the status neither re-drives nor restarts the cooldown")
	void statusIsARead() {
		settle();

		service.status();
		service.status();

		assertThat(outbox.resubmissions()).isZero();
		assertThat(service.resubmit().code()).isEqualTo("RESUBMITTED");
	}

	/** A {@link MailOutbox} that counts calls and can be parked mid-resubmission. */
	private static final class RecordingOutbox implements MailOutbox {

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
