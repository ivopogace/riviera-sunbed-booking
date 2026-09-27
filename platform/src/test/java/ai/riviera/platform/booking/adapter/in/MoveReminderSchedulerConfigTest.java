package ai.riviera.platform.booking.adapter.in;

import java.lang.reflect.Method;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.annotation.Scheduled;

import ai.riviera.platform.booking.application.checkin.RemindStayMoves;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The move-reminder scheduler ships enabled (nothing else announces a move) and has the same
 * test-isolation switch as the no-show sweep, so an IT seeding a stay that moves tomorrow can get a
 * context without the bean; the sweep is {@code fixedDelay}, never {@code fixedRate}.
 */
class MoveReminderSchedulerConfigTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withBean(RemindStayMoves.class, () -> sendFrom -> 0)
			.withBean(MoveReminderProperties.class, () -> new MoveReminderProperties(null))
			.withUserConfiguration(MoveReminderScheduler.class);

	@Test
	void theShippedConfigurationRegistersTheScheduler() {
		runner.run(context -> assertThat(context).hasSingleBean(MoveReminderScheduler.class));
	}

	@Test
	void aTestCanOptOutSoTheSweepCannotTouchItsFixtures() {
		runner.withPropertyValues("booking.move-reminder.enabled=false")
				.run(context -> assertThat(context).doesNotHaveBean(MoveReminderScheduler.class));
	}

	@Test
	void theSweepIsFixedDelaySoRunsNeverOverlap() throws Exception {
		Method sweep = MoveReminderScheduler.class.getDeclaredMethod("sweep");
		Scheduled scheduled = sweep.getAnnotation(Scheduled.class);

		assertThat(scheduled).isNotNull();
		assertThat(scheduled.fixedDelayString()).isNotEmpty();
		assertThat(scheduled.fixedRateString()).isEmpty();
	}
}
