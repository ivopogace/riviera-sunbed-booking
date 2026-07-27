package ai.riviera.platform;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * The shared Testcontainers Postgres, <strong>alone</strong> — no mail-dispatch override.
 *
 * <p><strong>Almost every integration test wants {@link TestcontainersConfiguration} instead</strong>,
 * which imports this plus {@code SynchronousMailDispatch}. That bundling is deliberate (#369): since
 * the production dispatcher is asynchronous, a DB-backed test that missed the override would not
 * fail, it would <em>flake</em> — so the override rides along automatically rather than being
 * remembered per class.
 *
 * <p>This split exists for the one test that must NOT get the override: {@code MailSenderWiringIT}
 * (#386), whose whole subject is that the real, fully-wired {@code MailSender} dispatches off the
 * caller's thread. With the {@code @Primary} synchronous dispatcher installed, that property is
 * unobservable — every existing proof of it is either a mock or a class in isolation, which is
 * exactly the gap the review fan-out flagged: a future decorating {@code @Primary MailSender} doing
 * inline I/O would pass all of them while re-opening the #369 timing oracle.
 *
 * <p>So: importing this directly is opting out of a flake guard. Do it only when asynchrony is the
 * thing under test, and say so in the test's Javadoc.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresContainerConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:17"));
	}

}
