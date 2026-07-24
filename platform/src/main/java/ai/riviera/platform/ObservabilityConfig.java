package ai.riviera.platform;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * App-level observability wiring (issue #100, D4) — a root-package concern, not a Modulith module
 * (like {@link SecurityConfig}/{@link WebCorsConfig}). Registers the cross-cutting
 * {@link CorrelationIdFilter} as a top-level servlet filter at {@code HIGHEST_PRECEDENCE} so it runs
 * ahead of Spring Security and {@link RateLimitFilter}: the correlation id is then in the MDC for the
 * earliest log line of every request, across both the API and the SPA security chains.
 */
@Configuration
class ObservabilityConfig {

	@Bean
	FilterRegistrationBean<CorrelationIdFilter> correlationIdFilter() {
		FilterRegistrationBean<CorrelationIdFilter> registration = new FilterRegistrationBean<>(new CorrelationIdFilter());
		registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
		registration.addUrlPatterns("/*");
		return registration;
	}
}
