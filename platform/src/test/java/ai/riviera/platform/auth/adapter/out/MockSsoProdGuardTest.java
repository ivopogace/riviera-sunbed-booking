package ai.riviera.platform.auth.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import ai.riviera.platform.shared.BootPostureGuard;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The mock IdP's fence (ADR-0031): with neither {@code demo} nor {@code sso} the guard reports the mock; either
 * marker removes it. {@link ApplicationContextRunner}, no Boot context.
 */
class MockSsoProdGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(MockSsoProdGuard.class);

	@Test
	void anUnmarkedBootReportsTheMockIdentityProvider() {
		runner.run(context -> assertThat(context.getBean(BootPostureGuard.class).gap(context.getEnvironment()))
				.hasValueSatisfying(gap -> assertThat(gap).contains("SSO").contains("'sso'").contains("'demo'")));
	}

	@Test
	void demoRunsTheMockOnPurpose() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("demo"))
				.run(context -> assertThat(context).doesNotHaveBean(BootPostureGuard.class));
	}

	@Test
	void ssoReplacesTheMock() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("sso"))
				.run(context -> assertThat(context).doesNotHaveBean(BootPostureGuard.class));
	}
}
