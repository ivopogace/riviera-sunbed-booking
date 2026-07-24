package ai.riviera.platform;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Issue #100 (D4), AC-7: the money-path self-check logs exactly one structured {@code ERROR} per signal
 * that crosses its threshold, and nothing when every signal is healthy. A plain unit test — the check
 * reads the three signals from a {@link SimpleMeterRegistry}, and a Logback {@link ListAppender}
 * captures the ERROR events (robust without a Spring context, unlike {@code OutputCaptureExtension}).
 */
class MoneyPathAlertCheckTest {

	private static final MoneyPathAlertProperties PROPS =
			new MoneyPathAlertProperties(10, 0, "/api/payments/stripe/webhook");

	private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
	private final AtomicLong outboxBacklog = new AtomicLong(0);
	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private ch.qos.logback.classic.Logger checkLogger;
	private MoneyPathAlertCheck check;

	@BeforeEach
	void setUp() {
		Gauge.builder(ObservabilityMetrics.OUTBOX_PENDING, outboxBacklog, AtomicLong::doubleValue).register(meters);
		logs.start();
		checkLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(MoneyPathAlertCheck.class);
		checkLogger.addAppender(logs);
		check = new MoneyPathAlertCheck(meters, PROPS);
	}

	@AfterEach
	void tearDown() {
		checkLogger.detachAppender(logs);
	}

	private List<String> errorMessages() {
		return logs.list.stream()
				.filter(event -> event.getLevel() == Level.ERROR)
				.map(ILoggingEvent::getFormattedMessage)
				.toList();
	}

	private void recordWebhookResponse(String status) {
		Timer.builder(ObservabilityMetrics.HTTP_SERVER_REQUESTS)
				.tags("uri", PROPS.webhookUri(), "status", status, "outcome", "SERVER_ERROR")
				.register(meters)
				.record(Duration.ofMillis(1));
	}

	@Test
	void healthySignalsLogNothing() {
		outboxBacklog.set(3); // under the threshold of 10

		check.check();

		assertTrue(errorMessages().isEmpty(), () -> "expected no alert, got: " + errorMessages());
	}

	@Test
	void outboxBacklogOverThresholdLogsOneError() {
		outboxBacklog.set(25);

		check.check();

		List<String> errors = errorMessages();
		assertEquals(1, errors.size(), () -> "expected exactly one alert, got: " + errors);
		assertTrue(errors.getFirst().contains("outbox backlog"), () -> errors.getFirst());
		assertTrue(errors.getFirst().contains("25"), () -> errors.getFirst());
	}

	@Test
	void aFailedRefundLogsError() {
		meters.counter(ObservabilityMetrics.REFUNDS_FAILED).increment();

		check.check();

		List<String> errors = errorMessages();
		assertEquals(1, errors.size(), () -> "expected exactly one alert, got: " + errors);
		assertTrue(errors.getFirst().contains("refund"), () -> errors.getFirst());
	}

	@Test
	void aWebhookServerErrorLogsError() {
		recordWebhookResponse("500");

		check.check();

		List<String> errors = errorMessages();
		assertEquals(1, errors.size(), () -> "expected exactly one alert, got: " + errors);
		assertTrue(errors.getFirst().contains("webhook 5xx"), () -> errors.getFirst());
	}

	@Test
	void aWebhookSuccessDoesNotAlert() {
		recordWebhookResponse("200");

		check.check();

		assertTrue(errorMessages().isEmpty(), () -> "a 2xx webhook must not alert, got: " + errorMessages());
	}

	@Test
	void deltaSignalsDoNotReAlertWhenNothingNewHappens() {
		meters.counter(ObservabilityMetrics.REFUNDS_FAILED).increment();
		check.check(); // first check alerts on the new failure

		logs.list.clear();
		check.check(); // second check: no NEW failure since the last run

		assertTrue(errorMessages().isEmpty(), () -> "a stable counter must not re-alert, got: " + errorMessages());
	}
}
