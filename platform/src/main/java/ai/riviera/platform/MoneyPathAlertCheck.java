package ai.riviera.platform;

import ai.riviera.platform.shared.ObservabilityMetrics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The money-path alert route (issue #100, D4): a scheduled self-check that evaluates the three
 * money-path signals against their thresholds and emits a structured {@code ERROR} log line when one
 * trips — the deliberate single-instance alerting mechanism (an ERROR line is greppable and forwardable
 * by a Render log drain; the {@code /actuator/prometheus} → Grafana route is the documented upgrade,
 * see {@code docs/runbooks/observability.md}). It reads the signals from the {@link MeterRegistry}
 * (the gauge/counter/timer wired in {@link ObservabilityConfig} + Boot's {@code http.server.requests}),
 * so it adds no query of its own and stays trivially testable.
 *
 * <p>Gated {@code @Profile("stripe")} — the money path is only live there, and gating keeps this third
 * scheduler off the default-profile test suite (the {@code @EnableScheduling} the sweeps rely on is
 * itself stripe-gated). A long initial delay keeps it off the startup hot path. Alert lines carry only
 * counts + thresholds — never a booking code or PII (invariant #7). App-level concern in the root
 * package (like {@link RateLimitFilter}), not a Modulith module. Single-instance posture inherited from
 * the sweeps ({@code docs/deploy/production-hardening.md}); ShedLock only when scaling out (D3).
 */
@Component
@Profile("stripe")
class MoneyPathAlertCheck {

	private static final Logger log = LoggerFactory.getLogger(MoneyPathAlertCheck.class);
	private static final String SERVER_ERROR_STATUS_PREFIX = "5";

	private final MeterRegistry meters;
	private final MoneyPathAlertProperties props;

	// Last-seen cumulative counts for delta alerting (reset to 0 on restart; scheduler-thread-only, no overlap).
	private double lastFailedRefunds;
	private double lastWebhookServerErrors;

	MoneyPathAlertCheck(MeterRegistry meters, MoneyPathAlertProperties props) {
		this.meters = meters;
		this.props = props;
	}

	@Scheduled(fixedDelayString = "${riviera.observability.alert.interval:PT5M}",
			initialDelayString = "${riviera.observability.alert.initial-delay:PT1M}")
	void check() {
		long backlog = outboxBacklog();
		if (backlog > props.outboxBacklogThreshold()) {
			log.error("money-path alert: outbox backlog is {} (threshold {}) — event publications are not draining",
					backlog, props.outboxBacklogThreshold());
		}

		long newFailedRefunds = failedRefundsSinceLastCheck();
		if (newFailedRefunds > 0) {
			log.error("money-path alert: {} refund(s) failed since the last check — a tourist may be owed money",
					newFailedRefunds);
		}

		long newWebhookServerErrors = webhookServerErrorsSinceLastCheck();
		if (newWebhookServerErrors > props.webhookServerErrorThreshold()) {
			log.error("money-path alert: {} webhook 5xx response(s) since the last check (threshold {}) — "
					+ "Stripe may be retrying and payment state may lag", newWebhookServerErrors,
					props.webhookServerErrorThreshold());
		}
	}

	private long outboxBacklog() {
		Gauge gauge = meters.find(ObservabilityMetrics.OUTBOX_PENDING).gauge();
		return gauge == null ? 0L : (long) gauge.value();
	}

	private long failedRefundsSinceLastCheck() {
		double total = meters.counter(ObservabilityMetrics.REFUNDS_FAILED).count();
		long delta = (long) (total - lastFailedRefunds);
		lastFailedRefunds = total;
		return delta;
	}

	private long webhookServerErrorsSinceLastCheck() {
		double total = meters.find(ObservabilityMetrics.HTTP_SERVER_REQUESTS)
				.tag("uri", props.webhookUri())
				.timers()
				.stream()
				.filter(MoneyPathAlertCheck::isServerError)
				.mapToDouble(Timer::count)
				.sum();
		long delta = (long) (total - lastWebhookServerErrors);
		lastWebhookServerErrors = total;
		return delta;
	}

	private static boolean isServerError(Timer timer) {
		String status = timer.getId().getTag("status");
		return status != null && status.startsWith(SERVER_ERROR_STATUS_PREFIX);
	}
}
