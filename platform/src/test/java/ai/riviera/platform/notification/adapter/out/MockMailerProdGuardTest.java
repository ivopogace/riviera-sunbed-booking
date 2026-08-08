package ai.riviera.platform.notification.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the fail-fast prod guard (AC-10): the mock mailer must never run in production. Under
 * {@code prod} without {@code mailer} the guard bean is created and aborts startup; under {@code prod,mailer}
 * (the intended production activation) and under the default profile the guard is absent and startup
 * succeeds. Uses {@link ApplicationContextRunner} — no Spring Boot context, fast, no Docker (sibling to
 * {@code MockSsoProdGuardTest}).
 */
class MockMailerProdGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(MockMailerProdGuard.class);

	@Test
	void prodWithoutMailerAbortsStartup() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> {
					assertThat(context).hasFailed();
					assertThat(context).getFailure().rootCause().isInstanceOf(IllegalStateException.class);
				});
	}

	@Test
	void prodWithMailerBootsWithoutTheGuard() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod", "mailer"))
				.run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void defaultProfileBootsWithoutTheGuard() {
		runner.run(context -> assertThat(context).hasNotFailed());
	}
}
