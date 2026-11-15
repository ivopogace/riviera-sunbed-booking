package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.ComponentScan.Filter;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.core.env.StandardEnvironment;

import ai.riviera.platform.shared.BootPostureGuard;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The shipped properties files and every module's {@link BootPostureGuard}, under the shared check (ADR-0031): an
 * unmarked boot with no env is refused in one abort naming every gap; {@code demo} with a real pepper starts on
 * the mocks; {@code local}, and the profiles that group it in, start with zero env.
 */
class SecureBootPostureTest {

	private static final String REAL_PEPPER = "RIVIERA_SUPPRESSION_PEPPER=a-real-deployment-secret";

	private final ApplicationContextRunner shippedBoot = new ApplicationContextRunner()
			.withInitializer(context -> context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
			.withPropertyValues("spring.config.location=classpath:/application.properties")
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(EveryGuardAndTheCheck.class);

	@Test
	void anUnmarkedBootWithNoEnvIsRefusedNamingEveryGap() {
		shippedBoot.run(context -> {
			assertThat(context).hasFailed();
			assertThat(context).getFailure().isInstanceOf(IllegalStateException.class)
					.hasMessageContaining("RIVIERA_SUPPRESSION_PEPPER")
					.hasMessageContaining("'mailer'")
					.hasMessageContaining("'sso'")
					.hasMessageContaining("Payment");
		});
	}

	@Test
	void aProviderAndARealPepperLeaveOnlyTheMocksWithoutAMarker() {
		shippedBoot.withSystemProperties(REAL_PEPPER).withPropertyValues("spring.profiles.active=stripe")
				.run(context -> assertThat(context).getFailure()
						.hasMessageContaining("'mailer'")
						.hasMessageContaining("'sso'")
						.hasMessageNotContaining("Payment")
						.hasMessageNotContaining("RIVIERA_SUPPRESSION_PEPPER"));
	}

	@Test
	void demoWithARealPepperStartsOnTheMocks() {
		shippedBoot.withSystemProperties(REAL_PEPPER).withPropertyValues("spring.profiles.active=demo,stripe")
				.run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void demoStillNeedsARealPepper() {
		shippedBoot.withPropertyValues("spring.profiles.active=demo")
				.run(context -> assertThat(context).getFailure()
						.hasMessageContaining("RIVIERA_SUPPRESSION_PEPPER")
						.hasMessageNotContaining("'mailer'"));
	}

	@Test
	void localAndEveryProfileGroupingItInStartWithZeroEnv() {
		for (String profile : new String[] {"local", "dev", "smtp4dev"}) {
			shippedBoot.withPropertyValues("spring.profiles.active=" + profile).run(context -> {
				assertThat(context).hasNotFailed();
				assertThat(context.getEnvironment().matchesProfiles("demo")).as(profile).isTrue();
			});
		}
	}

	@Configuration(proxyBeanMethods = false)
	@ComponentScan(basePackages = "ai.riviera.platform", useDefaultFilters = false, includeFilters = {
			@Filter(type = FilterType.ASSIGNABLE_TYPE, classes = BootPostureGuard.class),
			@Filter(type = FilterType.REGEX, pattern = "ai\\.riviera\\.platform\\.shared\\.BootPostureCheck") })
	static class EveryGuardAndTheCheck {
	}
}
