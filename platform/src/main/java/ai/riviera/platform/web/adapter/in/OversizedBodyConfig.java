package ai.riviera.platform.web.adapter.in;

import org.springframework.boot.tomcat.TomcatContextCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Tomcat closes the connection after any {@code 413} instead of draining the rest of the body (up to
 * {@code server.tomcat.max-swallow-size}) at the client's pace on a held request thread. A client still
 * sending may therefore see a reset rather than the {@code 413} body. Rationale: {@code RESPONSIBILITIES.md}
 * §{@code web}.
 */
@Configuration
class OversizedBodyConfig {

	@Bean
	TomcatContextCustomizer abortOversizedBodies() {
		return context -> context.setSwallowAbortedUploads(false);
	}
}
