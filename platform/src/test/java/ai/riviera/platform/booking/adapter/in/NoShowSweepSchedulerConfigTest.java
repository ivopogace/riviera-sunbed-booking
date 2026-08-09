package ai.riviera.platform.booking.adapter.in;

import java.lang.reflect.Method;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.annotation.Scheduled;

import ai.riviera.platform.booking.application.checkin.MarkNoShows;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the no-show scheduler's <strong>ships-enabled</strong> posture and the test-isolation seam
 * that pays for it. {@code NO_SHOW} has no writer but this sweep, so unlike the retention job it
 * must exist with the shipped configuration — and unlike the retention job its switch is there so
 * an integration test seeding past-day {@code CONFIRMED} fixtures can get a context without the
 * bean. Both directions are asserted, because either one regressing is silent: a bean that stops
 * shipping means no-shows are never written, and a switch that stops working means the sweep can
 * fire mid-suite and rewrite other tests' fixtures (#98/#122).
 *
 * <p>Deliberately does <strong>not</strong> assert a floor on the cadence. An earlier draft did,
 * to keep the sweep out of test windows by wall clock, which coupled a production tuning knob to a
 * unit test; the condition above is the mechanism, so the cadence is free.
 */
class NoShowSweepSchedulerConfigTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withBean(MarkNoShows.class, () -> () -> 0)
			.withUserConfiguration(NoShowSweepScheduler.class);

	@Test
	void theShippedConfigurationRegistersTheSchedulerSoNoShowsAreActuallyWritten() {
		runner.run(context -> assertThat(context).hasSingleBean(NoShowSweepScheduler.class));
	}

	@Test
	void anExplicitlyEnabledSweepAlsoRegisters() {
		runner.withPropertyValues("booking.no-show.enabled=true")
				.run(context -> assertThat(context).hasSingleBean(NoShowSweepScheduler.class));
	}

	@Test
	void aTestCanOptOutSoTheSweepCannotTouchItsFixtures() {
		runner.withPropertyValues("booking.no-show.enabled=false")
				.run(context -> assertThat(context).doesNotHaveBean(NoShowSweepScheduler.class));
	}

	@Test
	void theSweepIsFixedDelaySoRunsNeverOverlap() throws Exception {
		Method sweep = NoShowSweepScheduler.class.getDeclaredMethod("sweep");
		Scheduled scheduled = sweep.getAnnotation(Scheduled.class);

		assertThat(scheduled).as("the sweep must actually be scheduled").isNotNull();
		assertThat(scheduled.fixedDelayString()).isNotEmpty();
		assertThat(scheduled.fixedRateString())
				.as("fixedRate would let a slow sweep overlap itself on this instance")
				.isEmpty();
	}
}
