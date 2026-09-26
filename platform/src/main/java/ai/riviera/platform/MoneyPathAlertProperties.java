package ai.riviera.platform;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Tunables for the money-path alert self-check: the thresholds {@link MoneyPathAlertCheck} compares
 * each signal against and the webhook path whose 5xx it watches (schedule timings live on the
 * {@code @Scheduled} placeholders). Defaults suit a low-volume single-instance launch.
 *
 * @param outboxBacklogThreshold alert above this backlog (brief: normal; sustained: not draining)
 * @param webhookServerErrorThreshold alert above this many webhook 5xx per check (0 = any)
 * @param webhookUri the {@code uri} tag whose 5xx {@code http.server.requests} samples count
 */
@ConfigurationProperties("riviera.observability.alert")
record MoneyPathAlertProperties(
		@DefaultValue("10") long outboxBacklogThreshold,
		@DefaultValue("0") long webhookServerErrorThreshold,
		@DefaultValue("/api/payments/stripe/webhook") String webhookUri) {
}
