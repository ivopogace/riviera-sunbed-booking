package ai.riviera.platform;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Shared Testcontainers Postgres for Spring Boot integration tests. Public so feature
 * integration tests in module sub-packages (e.g. {@code ai.riviera.platform.venue}) can
 * {@code @Import} it and reuse the one container definition.
 *
 * <p>It also pulls in {@link SynchronousMailDispatch} (#369) so recovery-mail sends stay inline in every
 * integration test. That rides here deliberately rather than on each test class: since #369 the production
 * dispatcher is asynchronous, and a test class that missed the override would not fail — it would flake.
 */
@TestConfiguration(proxyBeanMethods = false)
@Import(SynchronousMailDispatch.class)
public class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:17"));
	}

}
