package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the {@code riviera.recovery.link-base-url} binding (#368 AC: mailed links point at the real
 * deployed origin, not {@code localhost:4200}) — split out of {@code MailerProfileWiringTest} when
 * that class moved into the {@code notification} module (#382): the link base URL is <em>edge</em>
 * config ({@code RecoveryProperties} stays root-package-private with {@code CustomerRecovery},
 * which builds the links), so its binding test stays at the root. Same harness posture as its
 * former host: {@link ApplicationContextRunner} + {@link ConfigDataApplicationContextInitializer},
 * real properties files, no Spring Boot context, no Docker.
 */
class RecoveryPropertiesBindingTest {

	@Test
	void linkBaseUrlDefaultsToLocalDevSpa() {
		recoveryRunner().run(context -> assertThat(context.getBean(RecoveryProperties.class).linkBaseUrl())
				.isEqualTo("http://localhost:4200"));
	}

	@Test
	void theEnvironmentOverridesTheLinkBaseUrl() {
		recoveryRunner().withSystemProperties("RIVIERA_RECOVERY_LINK_BASE_URL=https://app.example")
				.run(context -> assertThat(context.getBean(RecoveryProperties.class).linkBaseUrl())
						.isEqualTo("https://app.example"));
	}

	private static ApplicationContextRunner recoveryRunner() {
		return new ApplicationContextRunner()
				.withInitializer(new ConfigDataApplicationContextInitializer())
				.withUserConfiguration(RecoveryBindOnly.class);
	}

	@Configuration
	@EnableConfigurationProperties(RecoveryProperties.class)
	static class RecoveryBindOnly {
	}
}
