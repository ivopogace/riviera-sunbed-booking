package ai.riviera.platform.notification.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the suppression-pepper fail-fast guard (#388, AC-3): under the {@code prod} profile the
 * pepper must be a real secret — an unset property (blank) and the committed dev default both abort
 * startup; a real value boots, and outside {@code prod} the guard is absent entirely (dev/tests run
 * on the committed default). Uses {@link ApplicationContextRunner} — no Spring Boot context, fast,
 * no Docker (sibling to {@code MockMailerProdGuardTest}).
 */
class SuppressionPepperProdGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(SuppressionPepperProdGuard.class);

	@Test
	void prodWithoutAPepperAbortsStartup() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> {
					assertThat(context).hasFailed();
					assertThat(context).getFailure().rootCause().isInstanceOf(IllegalStateException.class);
				});
	}

	@Test
	void prodWithTheDevDefaultPepperAbortsStartup() {
		runner.withPropertyValues(
						"riviera.notification.suppression-pepper=" + SuppressionPepperProdGuard.DEV_DEFAULT_PEPPER)
				.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> {
					assertThat(context).hasFailed();
					assertThat(context).getFailure().rootCause().isInstanceOf(IllegalStateException.class);
				});
	}

	@Test
	void prodWithARealPepperBoots() {
		runner.withPropertyValues("riviera.notification.suppression-pepper=a-real-prod-secret")
				.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void defaultProfileBootsWithoutTheGuard() {
		runner.run(context -> assertThat(context).hasNotFailed());
	}
}
