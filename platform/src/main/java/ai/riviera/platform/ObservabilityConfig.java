package ai.riviera.platform;

import ai.riviera.platform.shared.ObservabilityMetrics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.binder.MeterBinder;

import javax.sql.DataSource;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * App-level observability wiring — a root-package concern, not a Modulith module
 * (like {@link SecurityConfig}/{@link WebCorsConfig}). It owns the cross-cutting instrumentation the
 * whole app shares: the {@link CorrelationIdFilter} registration and the money-path metrics that back
 * the alert self-check.
 *
 * <p>Metric names live in {@link ObservabilityMetrics} (a public {@code shared}-kernel vocabulary) so the emitters
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
	 * Outbox-backlog gauge: under {@code completion-mode=archive}, {@code event_publication} holds only incomplete
	 * publications, so non-zero is undelivered work. The {@code count(*)} runs on the reader's thread — including
	 * {@code MoneyPathAlertCheck}'s scheduler — so it is bounded; a timeout reads {@code NaN} and the next tick retries.
	 */
	@Bean
	MeterBinder outboxBacklogMetric(DataSource dataSource, ScheduledQueryTimeout queryTimeout) {
		JdbcClient bounded = boundedClient(dataSource, queryTimeout.seconds());
		return registry -> Gauge.builder(ObservabilityMetrics.OUTBOX_PENDING, () -> pendingPublications(bounded))
				.description("Incomplete Spring Modulith event publications awaiting delivery (outbox backlog)")
				.strongReference(true)
				.register(registry);
	}

	/**
	 * A {@link JdbcClient} with a finite {@code queryTimeout} ({@link ScheduledQueryTimeout}), scoped to this gauge. Never set
	 * the global {@code spring.jdbc.template.query-timeout}: it would bound the invariant #2 claim, whose loser waits on the
	 * winner's lock, into spurious aborts ({@code ScheduledWorkArchitectureTest} fails the build on it).
	 */
	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		return JdbcClient.create(bounded);
	}

	private static Number pendingPublications(JdbcClient jdbc) {
		return jdbc.sql("SELECT count(*) FROM event_publication").query(Long.class).single();
	}
}
