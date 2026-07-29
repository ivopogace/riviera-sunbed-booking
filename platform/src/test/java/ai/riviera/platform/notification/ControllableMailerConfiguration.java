package ai.riviera.platform.notification;

import javax.sql.DataSource;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Installs {@link ControllableMailer} as the transport for a registry-mail IT.
 *
 * <p>A top-level {@code @TestConfiguration} rather than a nested one (#407) so both driving ITs get
 * the same transport from one definition. Importing it is also what keeps each importer off the
 * suite's shared context: a class that deliberately wedges a thread pool must not hand that pool to
 * the next class in the run.
 */
@TestConfiguration(proxyBeanMethods = false)
public class ControllableMailerConfiguration {

	@Bean
	@Primary
	ControllableMailer controllableMailer(DataSource dataSource) {
		return new ControllableMailer(dataSource);
	}
}
