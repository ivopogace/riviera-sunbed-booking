package ai.riviera.platform.notification.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import ai.riviera.platform.shared.BootPostureGuard;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The mock mailer's fence (ADR-0031): with neither {@code demo} nor {@code mailer} the guard reports the mock;
 * either marker removes it. {@link ApplicationContextRunner}, no Boot context.
 */
class MockMailerProdGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(MockMailerProdGuard.class);

	@Test
	void anUnmarkedBootReportsTheMockMailer() {
		runner.run(context -> assertThat(context.getBean(BootPostureGuard.class).gap(context.getEnvironment()))
				.hasValueSatisfying(gap -> assertThat(gap).contains("Mail").contains("'mailer'").contains("'demo'")));
	}

	@Test
	void demoRunsTheMockOnPurpose() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("demo"))
				.run(context -> assertThat(context).doesNotHaveBean(BootPostureGuard.class));
	}

	@Test
	void mailerReplacesTheMock() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("mailer"))
				.run(context -> assertThat(context).doesNotHaveBean(BootPostureGuard.class));
	}
}
