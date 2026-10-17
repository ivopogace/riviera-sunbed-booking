package ai.riviera.platform.notification.adapter.out;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the link-origin fail-fast guard: under {@code prod} a loopback or blank {@code riviera.notification.booking-link.base-url}
 * aborts startup with a cause naming {@code RIVIERA_RECOVERY_LINK_BASE_URL}; a real origin boots, and
 * outside {@code prod} the guard is absent. {@link ApplicationContextRunner}, no Docker (sibling to
 * {@code SuppressionPepperProdGuardTest}).
 */
class BookingLinkOriginProdGuardTest {

	private static final String KEY = "riviera.notification.booking-link.base-url";

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(BookingLinkOriginProdGuard.class);

	@ParameterizedTest
	@ValueSource(strings = {"http://localhost:4200", "https://LOCALHOST", "http://localhost.:8080",
			"http://127.0.0.1:8080", "http://127.1.2.3", "http://[::1]:4200", "http://[0:0:0:0:0:0:0:1]",
			"  http://localhost:4200  ", ""})
	void prodWithALoopbackOrBlankOriginAbortsStartup(String origin) {
		runner.withPropertyValues(KEY + "=" + origin)
				.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> {
					assertThat(context).hasFailed();
					assertThat(context).getFailure().rootCause().isInstanceOf(IllegalStateException.class)
							.hasMessageContaining("RIVIERA_RECOVERY_LINK_BASE_URL");
				});
	}

	@Test
	void prodWithTheKeyAbsentAbortsStartup() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> {
					assertThat(context).hasFailed();
					assertThat(context).getFailure().rootCause().hasMessageContaining("RIVIERA_RECOVERY_LINK_BASE_URL");
				});
	}

	@ParameterizedTest
	@ValueSource(strings = {"https://riviera-sunbed-booking.onrender.com", "https://example.com/",
			"http://127.example.com", "http://localhost.example.com", "http://10.0.0.5:8080"})
	void prodWithARealOriginBoots(String origin) {
		runner.withPropertyValues(KEY + "=" + origin)
				.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> assertThat(context).hasNotFailed());
	}

	@ParameterizedTest
	@ValueSource(strings = {"dev", "mailer", "smtp4dev"})
	void otherProfilesBootOnTheLoopbackDefault(String profile) {
		runner.withPropertyValues(KEY + "=http://localhost:4200")
				.withInitializer(context -> context.getEnvironment().setActiveProfiles(profile))
				.run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void defaultProfileBootsWithoutTheGuard() {
		runner.run(context -> assertThat(context).hasNotFailed());
	}

	/** The shipped default is the loopback origin the guard rejects, so an unset prod variable aborts. */
	@Test
	void theCommittedDefaultIsRejectedUnderProd() {
		new ApplicationContextRunner()
				.withUserConfiguration(BookingLinkOriginProdGuard.class)
				.withInitializer(new ConfigDataApplicationContextInitializer())
				.withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
				.run(context -> assertThat(context).hasFailed());
	}
}
