package ai.riviera.platform.notification.adapter.out;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.assertj.AssertableApplicationContext;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import ai.riviera.platform.shared.BootPostureGuard;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The pepper's fence (ADR-0012, ADR-0031): outside {@code local}, a blank or committed-dev pepper is a gap and a
 * real one is not; under {@code local} the guard is absent. Also pins where the committed pepper lives.
 */
class SuppressionPepperProdGuardTest {

	private static final String PEPPER_KEY = "riviera.notification.suppression-pepper";

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(SuppressionPepperProdGuard.class);

	private final ApplicationContextRunner shippedFiles = new ApplicationContextRunner()
			.withInitializer(context -> context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
			.withPropertyValues("spring.config.location=classpath:/application.properties")
			.withInitializer(new ConfigDataApplicationContextInitializer());

	@Test
	void anUnsetPepperIsAGap() {
		runner.run(context -> assertThat(gapOf(context))
				.hasValueSatisfying(gap -> assertThat(gap).contains("RIVIERA_SUPPRESSION_PEPPER")));
	}

	@Test
	void theCommittedDevPepperIsAGap() {
		runner.withPropertyValues(PEPPER_KEY + "=" + SuppressionPepperProdGuard.DEV_DEFAULT_PEPPER)
				.run(context -> assertThat(gapOf(context)).isPresent());
	}

	@Test
	void aRealPepperIsNoGap() {
		runner.withPropertyValues(PEPPER_KEY + "=a-real-deployment-secret")
				.run(context -> assertThat(gapOf(context)).isEmpty());
	}

	@Test
	void localRunsOnTheCommittedPepperWithoutTheGuard() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("local"))
				.run(context -> assertThat(context).doesNotHaveBean(BootPostureGuard.class));
	}

	/** Drift here lets a deployment set to the committed pepper pass the guard. */
	@Test
	void theLocalProfileCommitsTheGuardsDevPepper() {
		shippedFiles.withPropertyValues("spring.profiles.active=local")
				.run(context -> assertThat(context.getEnvironment().getProperty(PEPPER_KEY))
						.isEqualTo(SuppressionPepperProdGuard.DEV_DEFAULT_PEPPER));
	}

	@Test
	void theShippedDefaultCommitsNoPepper() {
		shippedFiles.run(context -> assertThat(context.getEnvironment().getProperty(PEPPER_KEY)).isEmpty());
	}

	private static Optional<String> gapOf(AssertableApplicationContext context) {
		return context.getBean(BootPostureGuard.class).gap(context.getEnvironment());
	}
}
