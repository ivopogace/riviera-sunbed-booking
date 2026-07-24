package ai.riviera.platform;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.binder.MeterBinder;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * App-level observability wiring (issue #100, D4) — a root-package concern, not a Modulith module
 * (like {@link SecurityConfig}/{@link WebCorsConfig}). It owns the cross-cutting instrumentation the
 * whole app shares: the {@link CorrelationIdFilter} registration and the money-path metrics that back
 * the alert self-check.
 *
 * <p>Metric names live in {@link ObservabilityMetrics} (a public root vocabulary) so the emitters
 * and the reader ({@code MoneyPathAlertCheck}) share one source of truth.
 */
@Configuration
@EnableConfigurationProperties(MoneyPathAlertProperties.class)
class ObservabilityConfig {

	@Bean
	FilterRegistrationBean<CorrelationIdFilter> correlationIdFilter() {
		FilterRegistrationBean<CorrelationIdFilter> registration = new FilterRegistrationBean<>(new CorrelationIdFilter());
		registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
		registration.addUrlPatterns("/*");
		return registration;
	}

	/**
	 * The outbox-backlog gauge (signal 1). Under {@code completion-mode=archive} the live
	 * {@code event_publication} table holds only <em>incomplete</em> publications (completed ones move
	 * to {@code event_publication_archive}), so a non-zero count is undelivered work — a listener that
	 * keeps failing, or an outbox draining slower than it fills. Read-only {@code count(*)} evaluated at
	 * scrape time; the registry table is framework infra owned by no module (invariant #2's
	 * {@code set_availability} sole-writer rule is untouched).
	 */
	@Bean
	MeterBinder outboxBacklogMetric(JdbcClient jdbc) {
		return registry -> Gauge.builder(ObservabilityMetrics.OUTBOX_PENDING, () -> pendingPublications(jdbc))
				.description("Incomplete Spring Modulith event publications awaiting delivery (outbox backlog)")
				.register(registry);
	}

	private static Number pendingPublications(JdbcClient jdbc) {
		return jdbc.sql("SELECT count(*) FROM event_publication").query(Long.class).single();
	}
}
