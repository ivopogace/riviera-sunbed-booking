package ai.riviera.platform.booking.adapter.in;

import java.lang.reflect.Method;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the no-show sweep's <strong>slack cadence</strong>, which is a test-isolation guarantee as
 * much as a behavioural choice. Unlike the retention job this scheduler ships enabled — a no-show
 * that is never marked is the bug — so the thing that keeps it out of the suite is the initial
 * delay alone: {@code @EnableScheduling} is global here, and this sweep would rewrite every
 * past-day {@code CONFIRMED} row in the shared container, which several ITs seed. Lowering the
 * default to "just a minute" is the plausible future edit that would recreate #98/#122, so the
 * floor is asserted rather than left to review.
 *
 * <p>Reads the annotation rather than starting a context: the values under test are the committed
 * <em>defaults</em> in the placeholders, and a context would resolve whatever the environment says.
 */
class NoShowSweepSchedulerConfigTest {

	/** Long enough that no suite reaches the first run; the abandoned sweep's PT1M would not be. */
	private static final Duration SUITE_SAFE_FLOOR = Duration.ofMinutes(30);

	private static Scheduled sweepSchedule() throws NoSuchMethodException {
		Method sweep = NoShowSweepScheduler.class.getDeclaredMethod("sweep");
		Scheduled scheduled = sweep.getAnnotation(Scheduled.class);
		assertThat(scheduled).as("the sweep must actually be scheduled").isNotNull();
		return scheduled;
	}

	/** {@code "${key:PT1H}"} → {@code PT1H} — the committed default, not the resolved value. */
	private static Duration defaultOf(String placeholder) {
		int colon = placeholder.indexOf(':');
		assertThat(colon).as("%s must carry an inline default", placeholder).isPositive();
		return Duration.parse(placeholder.substring(colon + 1, placeholder.length() - 1));
	}

	@Test
	void theInitialDelayKeepsTheFirstRunOutOfEveryTestWindow() throws Exception {
		Duration initialDelay = defaultOf(sweepSchedule().initialDelayString());

		assertThat(initialDelay)
				.as("a shorter default lets the sweep fire mid-suite and flip other tests' past-day"
						+ " CONFIRMED fixtures to NO_SHOW (case history: #98/#122)")
				.isGreaterThanOrEqualTo(SUITE_SAFE_FLOOR);
	}

	@Test
	void theCadenceIsDailyScaledNotMinuteScaled() throws Exception {
		Duration interval = defaultOf(sweepSchedule().fixedDelayString());

		assertThat(interval)
				.as("a booking becomes a no-show at a day boundary, so sweeping often buys nothing")
				.isGreaterThanOrEqualTo(SUITE_SAFE_FLOOR);
	}

	@Test
	void theSweepIsFixedDelaySoRunsNeverOverlap() throws Exception {
		Scheduled scheduled = sweepSchedule();

		assertThat(scheduled.fixedDelayString()).isNotEmpty();
		assertThat(scheduled.fixedRateString())
				.as("fixedRate would let a slow sweep overlap itself on this instance")
				.isEmpty();
	}
}
