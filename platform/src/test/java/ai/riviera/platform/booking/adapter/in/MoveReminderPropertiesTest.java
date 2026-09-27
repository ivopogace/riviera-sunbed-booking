package ai.riviera.platform.booking.adapter.in;

import java.time.LocalTime;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

/** The send hour as bound configuration: the shipped default, and an override read as Tirane wall-clock time. */
class MoveReminderPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(MoveReminderProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedSendHour() {
		runner.run(context -> assertThat(context.getBean(MoveReminderProperties.class).sendFrom())
				.isEqualTo(LocalTime.of(18, 0)));
	}

	@Test
	void anOverrideBindsAsWallClockTime() {
		runner.withPropertyValues("booking.move-reminder.send-from=19:30")
				.run(context -> assertThat(context.getBean(MoveReminderProperties.class).sendFrom())
						.isEqualTo(LocalTime.of(19, 30)));
	}

	@Test
	void anUnsetHourFallsBackToTheDefault() {
		assertThat(new MoveReminderProperties(null).sendFrom()).isEqualTo(LocalTime.of(18, 0));
	}
}
