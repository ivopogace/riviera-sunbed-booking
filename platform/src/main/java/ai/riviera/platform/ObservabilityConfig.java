package ai.riviera.platform;

import ai.riviera.platform.shared.ObservabilityMetrics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.binder.MeterBinder;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * App-level observability wiring (issue #100, D4) — a root-package concern, not a Modulith module
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

	/** Below 1 the bound is not a bound; above the 5-minute sweep cadence it no longer bounds. */
	private static final int MIN_QUERY_TIMEOUT_SECONDS = 1;
	private static final int MAX_QUERY_TIMEOUT_SECONDS = 300;

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
	 *
	 * <p><strong>"Evaluated at scrape time" is the whole reason this read is bounded (#395).</strong>
	 * Micrometer invokes the supplier on whichever thread reads the gauge, and one of those readers is
	 * {@code MoneyPathAlertCheck} on the scheduler thread — so what reads like pure registry access is a
	 * {@code count(*)} against the one table a stuck registry listener bloats. Both the issue and that
	 * class's own Javadoc claimed it "adds no query of its own"; it does, and an unbounded one would pin
	 * the money-path alarm to a lock wait. The other reader is an {@code /actuator/prometheus} scrape,
	 * on a request thread, where the same bound is equally welcome.
	 *
	 * <p>On timeout the gauge reports {@code NaN} rather than propagating — Micrometer swallows a
	 * supplier failure by design — so that tick's alert evaluation sees no backlog and the next one
	 * retries five minutes later. That is the accepted trade: a missed alert evaluation is recoverable,
	 * a pinned thread and connection are not.
	 */
	@Bean
	MeterBinder outboxBacklogMetric(DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int queryTimeoutSeconds) {
		JdbcClient bounded = boundedClient(dataSource, queryTimeoutSeconds);
		return registry -> Gauge.builder(ObservabilityMetrics.OUTBOX_PENDING, () -> pendingPublications(bounded))
				.description("Incomplete Spring Modulith event publications awaiting delivery (outbox backlog)")
				.strongReference(true)
				.register(registry);
	}

	/**
	 * The floor is 1, not 0: {@code setQueryTimeout(0)} means <strong>no limit</strong> to JDBC, and
	 * {@code JdbcTemplate} reads a negative as "use the driver default" — both silently restore the
	 * unbounded behaviour #395 removed, on a clean boot. The ceiling is the sweep cadence: a bound
	 * longer than the interval between runs is still holding when the next run is due, so it no longer
	 * bounds anything operationally. Guarded here because there is no JSR-303 validator on the
	 * classpath, so {@code @Min} would validate nothing (the #414/#426 house pattern).
	 */
	private static int validated(int queryTimeoutSeconds) {
		if (queryTimeoutSeconds < MIN_QUERY_TIMEOUT_SECONDS || queryTimeoutSeconds > MAX_QUERY_TIMEOUT_SECONDS) {
			throw new IllegalArgumentException("riviera.scheduled.query-timeout-seconds must be between "
					+ MIN_QUERY_TIMEOUT_SECONDS + " and " + MAX_QUERY_TIMEOUT_SECONDS + " seconds, but was "
					+ queryTimeoutSeconds + " — 0 and negatives mean NO limit, which is the unbounded"
					+ " scheduled query #395 exists to prevent");
		}
		return queryTimeoutSeconds;
	}

	/**
	 * A {@link JdbcClient} with a finite {@code queryTimeout}, scoped to this one gauge — the #386
	 * idiom ({@code JdbcEmailSuppressions#boundedClient}), applied to scheduled work by #395. Scoped
	 * rather than global on purpose: {@code spring.jdbc.template.query-timeout} would bound every
	 * statement in the application, including the {@code INSERT … ON CONFLICT (set_id, booking_date)}
	 * claim whose loser waits on the winner's index tuple lock — turning invariant #2's serialization
	 * point into a source of spurious aborts under exactly the contention it exists for.
	 * {@code ScheduledWorkArchitectureTest} fails the build if that global is ever set.
	 */
	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(validated(queryTimeoutSeconds));
		return JdbcClient.create(bounded);
	}

	private static Number pendingPublications(JdbcClient jdbc) {
		return jdbc.sql("SELECT count(*) FROM event_publication").query(Long.class).single();
	}
}
