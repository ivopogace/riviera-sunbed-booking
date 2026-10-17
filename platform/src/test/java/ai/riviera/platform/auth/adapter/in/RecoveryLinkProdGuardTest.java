package ai.riviera.platform.auth.adapter.in;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the recovery-link fail-fast guard: under {@code prod} a blank or loopback origin aborts
 * startup naming {@code RIVIERA_RECOVERY_LINK_BASE_URL}, a real origin boots, and outside {@code prod}
 * the guard is absent. Sibling to {@code SuppressionPepperProdGuardTest}.
 */
class RecoveryLinkProdGuardTest {

	private static final String KEY = "riviera.recovery.link-base-url=";

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(RecoveryLinkProdGuard.class);

	private ApplicationContextRunner prod() {
		return runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"));
	}

	@ParameterizedTest
	@ValueSource(strings = {"http://localhost:4200", "https://LOCALHOST", "http://app.localhost",
			"http://127.0.0.1:8080", "http://127.1.2.3", "http://[::1]:8080", "http://[0:0:0:0:0:0:0:1]",
			"http://[::ffff:127.0.0.1]", " http://localhost:4200 ", ""})
	void prodWithABlankOrLoopbackOriginAbortsStartupNamingTheVariable(String baseUrl) {
		prod().withPropertyValues(KEY + baseUrl).run(context -> {
			assertThat(context).hasFailed();
			assertThat(context).getFailure().rootCause().isInstanceOf(IllegalStateException.class)
					.hasMessageContaining("RIVIERA_RECOVERY_LINK_BASE_URL");
		});
	}

	@Test
	void prodWithAnUnsetKeyAbortsStartup() {
		prod().run(context -> assertThat(context).hasFailed());
	}

	@ParameterizedTest
	@ValueSource(strings = {"https://riviera-sunbed-booking.onrender.com", "http://10.0.0.5",
			"https://localhost.example.com", "http://128.0.0.1"})
	void prodWithARealOriginBoots(String baseUrl) {
		prod().withPropertyValues(KEY + baseUrl).run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void nonProdBootsWithTheLoopbackDefault() {
		runner.withPropertyValues(KEY + "http://localhost:4200")
				.run(context -> assertThat(context).hasNotFailed());
	}

	/** The committed default is what an unset prod env resolves to: the guard must reject it. */
	@Test
	void theCommittedDefaultIsRejectedUnderProd() {
		prod().withInitializer(new ConfigDataApplicationContextInitializer())
				.run(context -> assertThat(context).hasFailed());
	}
}
