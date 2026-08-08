package ai.riviera.platform;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Tunables for the money-path alert self-check — the thresholds the
 * {@link MoneyPathAlertCheck} compares each signal against, plus the webhook path whose 5xx responses
 * it watches. Schedule timings live on the {@code @Scheduled} placeholders (mirroring the sweeps), not
 * here. Defaults suit a low-volume single-instance soft launch; override per environment.
 *
 * @param outboxBacklogThreshold alert when the incomplete-publication backlog exceeds this (a small
 *        transient backlog is normal; a sustained one means events are not draining)
 * @param webhookServerErrorThreshold alert when the number of webhook 5xx responses since the previous
 *        check exceeds this (0 = alert on any)
 * @param webhookUri the request {@code uri} tag whose 5xx {@code http.server.requests} samples are the
 *        webhook-error signal
 */
@ConfigurationProperties("riviera.observability.alert")
record MoneyPathAlertProperties(
		@DefaultValue("10") long outboxBacklogThreshold,
		@DefaultValue("0") long webhookServerErrorThreshold,
		@DefaultValue("/api/payments/stripe/webhook") String webhookUri) {
}
