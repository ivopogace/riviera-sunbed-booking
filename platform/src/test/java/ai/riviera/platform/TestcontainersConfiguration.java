package ai.riviera.platform;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

import ai.riviera.platform.notification.application.SynchronousMailDispatch;

/**
 * Shared Testcontainers Postgres for Spring Boot integration tests. Public so feature
 * integration tests in module sub-packages (e.g. {@code ai.riviera.platform.venue}) can
 * {@code @Import} it and reuse the one container definition.
 *
 * <p>It also pulls in {@link SynchronousMailDispatch} so recovery-mail sends stay inline in every
 * integration test. That rides here deliberately rather than on each test class: the production
 * dispatcher is asynchronous, and a test class that missed the override would not fail — it would flake.
 *
 * <p>The container bean itself moved to {@link PostgresContainerConfiguration}, so a test whose
 * subject <em>is</em> the asynchrony can take the container without the override. This class keeps
 * importing both, so every existing test is unaffected and the default stays the safe one — see
 * {@link PostgresContainerConfiguration} for when opting out is legitimate.
 */
@TestConfiguration(proxyBeanMethods = false)
@Import({ PostgresContainerConfiguration.class, SynchronousMailDispatch.class })
public class TestcontainersConfiguration {

}
