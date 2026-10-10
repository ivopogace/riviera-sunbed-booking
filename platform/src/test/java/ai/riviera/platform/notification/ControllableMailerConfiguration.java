package ai.riviera.platform.notification;

import javax.sql.DataSource;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Installs {@link ControllableMailer} as the transport for a registry-mail IT.
 *
 * <p>A top-level {@code @TestConfiguration} rather than a nested one so every importer gets the
 * same transport from one definition. Importing it also keeps the importers off the suite's own
 * context: Spring's test context cache shares a context only between classes whose configuration
 * is the same, so the importers share one context among themselves, and an importer with its own
 * {@code @TestPropertySource} gets a context of its own. A class that wedges a thread pool therefore
 * never hands that pool to the suite's other classes, and must release the gate in its
 * {@code @AfterEach} so it never hands a parked thread to the next importer.
 */
@TestConfiguration(proxyBeanMethods = false)
public class ControllableMailerConfiguration {

	@Bean
	@Primary
	ControllableMailer controllableMailer(DataSource dataSource) {
		return new ControllableMailer(dataSource);
	}
}
