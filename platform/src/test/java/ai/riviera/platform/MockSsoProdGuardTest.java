package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the fail-fast prod guard (S4 #112, AC-6): the mock SSO must never run in production. Under the
 * {@code prod} profile without {@code sso} the guard bean is created and aborts startup; under
 * {@code prod,sso} (the intended production activation) and under the default profile the guard is absent
 * and startup succeeds. Uses {@link ApplicationContextRunner} — no Spring Boot context, fast, no Docker.
 */
class MockSsoProdGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(MockSsoProdGuard.class);

	@Test
	void prodWithoutSsoAbortsStartup() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> {
					assertThat(context).hasFailed();
					assertThat(context).getFailure().rootCause().isInstanceOf(IllegalStateException.class);
				});
	}

	@Test
	void prodWithSsoBootsWithoutTheGuard() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod", "sso"))
				.run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void defaultProfileBootsWithoutTheGuard() {
		runner.run(context -> assertThat(context).hasNotFailed());
	}
}
