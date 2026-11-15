package ai.riviera.platform.payment.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import ai.riviera.platform.shared.BootPostureGuard;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The stub gateway's fence (ADR-0031): with neither {@code demo} nor a collecting gateway the guard reports the
 * stub; {@code stripe}, through its {@code collecting-gateway} group, removes it, and so does {@code demo}.
 */
class StubPaymentGatewayProdGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(StubPaymentGatewayProdGuard.class);

	@Test
	void anUnmarkedBootReportsTheStubGateway() {
		runner.run(context -> assertThat(context.getBean(BootPostureGuard.class).gap(context.getEnvironment()))
				.hasValueSatisfying(gap -> assertThat(gap).contains("Payment").contains("'demo'")));
	}

	@Test
	void demoRunsTheStubOnPurpose() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("demo"))
				.run(context -> assertThat(context).doesNotHaveBean(BootPostureGuard.class));
	}

	@Test
	void stripeJoinsTheCollectingGatewayAndReplacesTheStub() {
		runner.withPropertyValues("spring.config.location=classpath:/application.properties",
						"spring.profiles.active=stripe")
				.withInitializer(new ConfigDataApplicationContextInitializer())
				.run(context -> assertThat(context).doesNotHaveBean(BootPostureGuard.class));
	}
}
