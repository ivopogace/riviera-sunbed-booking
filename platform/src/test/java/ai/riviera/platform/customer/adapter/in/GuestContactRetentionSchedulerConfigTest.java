package ai.riviera.platform.customer.adapter.in;

import java.time.Period;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import ai.riviera.platform.customer.application.ExpireGuestContacts;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the retention job's <strong>ships-disabled</strong> posture (AC-7 of #101 Slice 2): with the shipped
 * configuration no scheduler bean exists at all, so nothing can sweep until ops deliberately opts in — the
 * irreversible-erasure safety switch (R-2/R-6).
 *
 * <p>The same {@code @ConditionalOnProperty} does double duty as a <em>test</em> safeguard: {@code
 * @EnableScheduling} is global in this application, so an unconditional {@code @Scheduled} would fire during
 * the default-profile suite and could perturb other tests' timing windows (the #98/#122 lesson, R-3). A bean
 * that does not exist cannot fire.
 *
 * <p>Uses {@link ApplicationContextRunner} plus {@link ConfigDataApplicationContextInitializer} so the real
 * {@code application.properties} is evaluated without a Spring Boot context, no web layer and no Docker
 * (the {@code RateLimitPropertiesBindingTest} / {@code MockMailerProdGuardTest} sibling pattern). Lives in
 * the scheduler's own package because the component is package-private.
 */
class GuestContactRetentionSchedulerConfigTest {

	/** The use case is faked — this spec is about whether the scheduler bean exists and what it delegates to. */
	private final RecordingSweep sweep = new RecordingSweep();

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withBean(ExpireGuestContacts.class, () -> sweep)
			.withUserConfiguration(CustomerRetentionConfig.class, GuestContactRetentionScheduler.class);

	@Test
	void theShippedConfigurationRegistersNoSchedulerSoNothingCanSweep() {
		runner.run(context -> assertThat(context).doesNotHaveBean(GuestContactRetentionScheduler.class));
	}

	@Test
	void anExplicitlyDisabledRetentionAlsoRegistersNoScheduler() {
		runner.withPropertyValues("customer.retention.enabled=false")
				.run(context -> assertThat(context).doesNotHaveBean(GuestContactRetentionScheduler.class));
	}

	@Test
	void theSchedulerAppearsOnlyOnceOpsEnablesRetention() {
		runner.withPropertyValues("customer.retention.enabled=true")
				.run(context -> assertThat(context).hasSingleBean(GuestContactRetentionScheduler.class));
	}

	/**
	 * The scheduler's one job. Invoked directly rather than waited for: the {@code @Scheduled} cadence is
	 * config (a 5-minute initial delay), so waiting for the trigger would make this a slow, flaky test of
	 * Spring's scheduler rather than of our delegation.
	 */
	@Test
	void firingTheScheduledMethodDelegatesToTheRetentionUseCase() {
		runner.withPropertyValues("customer.retention.enabled=true").run(context -> {
			context.getBean(GuestContactRetentionScheduler.class).sweep();

			assertThat(sweep.invocations()).isEqualTo(1);
		});
	}

	@Test
	void theShippedWindowIsDeliberatelyInertAndTheBatchBounded() {
		runner.run(context -> {
			CustomerRetentionProperties properties = context.getBean(CustomerRetentionProperties.class);
			assertThat(properties.window())
					.as("longer than any plausible statutory period until counsel sets a real one")
					.isEqualTo(Period.ofYears(10));
			assertThat(properties.batchSize()).isEqualTo(500);
		});
	}

	@Test
	void theWindowIsConfigurableAsAnIsoPeriodInYears() {
		runner.withPropertyValues("customer.retention.window=P2Y")
				.run(context -> assertThat(context.getBean(CustomerRetentionProperties.class).window())
						.as("a retention window is expressed in years, which a Duration could not parse")
						.isEqualTo(Period.ofYears(2)));
	}

	/** Counts invocations so the scheduler→use-case wiring is provable without a real sweep. */
	private static final class RecordingSweep implements ExpireGuestContacts {
		private int invocations;

		int invocations() {
			return invocations;
		}

		@Override
		public int sweep() {
			invocations++;
			return 0;
		}
	}
}
