package ai.riviera.platform.booking.adapter.in;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import ai.riviera.platform.booking.application.refund.ExpireAbandonedBookings;
import ai.riviera.platform.booking.application.request.RequestWindows;

/**
 * The abandoned-payment sweep runs under any gateway that really collects, read through the real
 * {@code application.properties} so the profile group is the one that ships.
 */
class AbandonedSweepGatewaySwitchTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(context -> context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withBean(ExpireAbandonedBookings.class, () -> mock(ExpireAbandonedBookings.class))
			.withBean(RequestWindows.class, () -> mock(RequestWindows.class))
			.withUserConfiguration(BookingSchedulingConfig.class, AbandonedBookingScheduler.class);

	@Test
	void activeUnderStripe() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.run(context -> assertThat(context).hasSingleBean(BookingSchedulingConfig.class)
						.hasSingleBean(AbandonedBookingScheduler.class));
	}

	@Test
	void absentUnderTheDefaultStub() {
		runner.run(context -> assertThat(context).hasNotFailed()
				.doesNotHaveBean(BookingSchedulingConfig.class)
				.doesNotHaveBean(AbandonedBookingScheduler.class));
	}

	@Test
	void activeUnderAnyProfileJoiningTheSwitch() {
		runner.withPropertyValues("spring.profiles.active=acme-pay",
						"spring.profiles.group.acme-pay=collecting-gateway")
				.run(context -> assertThat(context).hasSingleBean(BookingSchedulingConfig.class)
						.hasSingleBean(AbandonedBookingScheduler.class));
	}
}
