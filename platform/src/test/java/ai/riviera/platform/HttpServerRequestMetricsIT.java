package ai.riviera.platform;

import ai.riviera.platform.shared.ObservabilityMetrics;
import java.util.Collection;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * AC-6: the webhook-5xx signal is a {@code (uri, status)} slice of the standard Boot
 * {@code http.server.requests} timer, so this IT proves that timer is <em>live</em> in this app —
 * recording real web requests with {@code uri} + {@code status} tags. A real HTTP round-trip
 * (RANDOM_PORT) so the server-side observation filter actually runs; the webhook uri + a 5xx status
 * are then just specific tag values the alert self-check filters on (pinned separately in phase 3).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HttpServerRequestMetricsIT {

	@LocalServerPort
	int port;

	@Autowired
	MeterRegistry meters;

	@Test
	void httpServerRequestsTimerRecordsRequestsWithUriAndStatusTags() {
		// A real request through the servlet container so the server-side observation is recorded.
		RestClient.create().get().uri("http://localhost:" + port + "/actuator/health").retrieve().toBodilessEntity();

		Timer recorded = awaitAnyHttpServerRequestTimer();

		assertNotNull(recorded, "http.server.requests must record web requests (backs the webhook-5xx signal)");
		assertNotNull(recorded.getId().getTag("uri"), "the timer must tag the request uri (the webhook path is one value)");
		assertNotNull(recorded.getId().getTag("status"), "the timer must tag the status (5xx is the alert slice)");
	}

	/** The server-side observation is stopped just after the response completes; poll briefly for it. */
	private Timer awaitAnyHttpServerRequestTimer() {
		for (int attempt = 0; attempt < 50; attempt++) {
			Collection<Timer> timers = meters.find(ObservabilityMetrics.HTTP_SERVER_REQUESTS).timers();
			Timer withTags = timers.stream()
					.filter(t -> t.getId().getTag("uri") != null && t.getId().getTag("status") != null)
					.findFirst()
					.orElse(null);
			if (withTags != null) {
				return withTags;
			}
			sleepBriefly();
		}
		return null;
	}

	private static void sleepBriefly() {
		try {
			Thread.sleep(20);
		}
		catch (InterruptedException interrupted) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("interrupted while waiting for the http.server.requests timer", interrupted);
		}
	}
}
