package ai.riviera.platform.notification.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import ai.riviera.platform.notification.application.BookingLinks;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the booking-mail link origin's boot posture against the SHIPPED properties files: the
 * {@code mailer} profile aborts when {@code RIVIERA_RECOVERY_LINK_BASE_URL} is unset, any explicit value
 * boots, and every other profile keeps the local default.
 */
class BookingLinkOriginWiringTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(context -> context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BookingLinkConfig.class);

	@Test
	void mailerProfileWithoutTheLinkOriginFailsAtBootNamingTheVariable() {
		runner.withPropertyValues("spring.profiles.active=mailer")
				.run(context -> assertThat(context).hasFailed().getFailure().rootCause()
						.hasMessageContaining("is unresolved")
						.hasMessageContaining("set RIVIERA_RECOVERY_LINK_BASE_URL"));
	}

	@Test
	void mailerProfileAcceptsAnExplicitLoopbackLinkOrigin() {
		runner.withPropertyValues("spring.profiles.active=mailer")
				.withSystemProperties("RIVIERA_RECOVERY_LINK_BASE_URL=http://localhost:8080")
				.run(context -> assertThat(context.getBean(BookingLinks.class).baseUrl())
						.isEqualTo("http://localhost:8080"));
	}

	@Test
	void anInvalidLinkOriginFailsAtBootNamingTheBoundKey() {
		runner.withSystemProperties("RIVIERA_RECOVERY_LINK_BASE_URL=https://riviera.example/?a=b")
				.withPropertyValues("spring.profiles.active=mailer")
				.run(context -> assertThat(context).hasFailed().getFailure().rootCause()
						.hasMessageStartingWith(BookingLinkConfig.BookingLinkProperties.PREFIX + ".base-url ")
						.hasMessageContaining("set RIVIERA_RECOVERY_LINK_BASE_URL"));
	}

	@Test
	void theBoundOriginIsTrimmed() {
		runner.withPropertyValues("riviera.notification.booking-link.base-url= https://riviera.example/ ")
				.run(context -> assertThat(context.getBean(BookingLinks.class).baseUrl())
						.isEqualTo("https://riviera.example"));
	}

	@Test
	void otherProfilesKeepTheLocalDefault() {
		runner.run(context -> assertThat(context.getBean(BookingLinks.class).baseUrl())
				.isEqualTo("http://localhost:4200"));
		runner.withPropertyValues("spring.profiles.active=smtp4dev")
				.run(context -> assertThat(context.getBean(BookingLinks.class).baseUrl())
						.isEqualTo("http://localhost:4200"));
	}
}
