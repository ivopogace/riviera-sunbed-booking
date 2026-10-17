package ai.riviera.platform.notification.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import ai.riviera.platform.notification.application.BookingLinks;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the {@code mailer}-profile boot posture of {@code riviera.notification.booking-link.base-url}: an unset
 * {@code RIVIERA_RECOVERY_LINK_BASE_URL} aborts the boot instead of mailing {@code localhost} links, an explicit
 * value (loopback included) is accepted, and every other profile keeps the local default.
 */
class BookingLinkConfigWiringTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BookingLinkConfig.class);

	@Test
	void mailerProfileWithoutTheLinkOriginFailsNamingTheVariable() {
		runner.withPropertyValues("spring.profiles.active=mailer")
				.run(context -> assertThat(context).hasFailed().getFailure()
						.hasStackTraceContaining("RIVIERA_RECOVERY_LINK_BASE_URL"));
	}

	@Test
	void mailerProfileAcceptsAnExplicitLoopbackOrigin() {
		runner.withPropertyValues("spring.profiles.active=mailer")
				.withSystemProperties("RIVIERA_RECOVERY_LINK_BASE_URL=http://localhost:8080")
				.run(context -> assertThat(context.getBean(BookingLinks.class).forBooking("ABC").toString())
						.startsWith("http://localhost:8080/"));
	}

	@Test
	void defaultAndSmtp4devProfilesKeepTheLocalDefault() {
		runner.run(context -> assertThat(context.getBean(BookingLinks.class).forBooking("ABC").toString())
				.startsWith("http://localhost:4200/"));
		runner.withPropertyValues("spring.profiles.active=smtp4dev")
				.run(context -> assertThat(context).hasNotFailed());
	}
}
