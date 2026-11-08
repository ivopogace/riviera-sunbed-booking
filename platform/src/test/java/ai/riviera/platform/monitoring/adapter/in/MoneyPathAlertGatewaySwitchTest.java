package ai.riviera.platform.monitoring.adapter.in;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * The money-path alert check runs under any gateway that really collects, read through the real
 * {@code application.properties} so the profile group is the one that ships.
 */
class MoneyPathAlertGatewaySwitchTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(context -> context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withBean(MeterRegistry.class, SimpleMeterRegistry::new)
			.withBean(MoneyPathAlertProperties.class,
					() -> new MoneyPathAlertProperties(10, 0, "/api/payments/stripe/webhook"))
			.withUserConfiguration(MoneyPathAlertCheck.class);

	@Test
	void activeUnderStripe() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.run(context -> assertThat(context).hasSingleBean(MoneyPathAlertCheck.class));
	}

	@Test
	void absentUnderTheDefaultStub() {
		runner.run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(MoneyPathAlertCheck.class));
	}

	@Test
	void activeUnderAnyProfileJoiningTheSwitch() {
		runner.withPropertyValues("spring.profiles.active=acme-pay",
						"spring.profiles.group.acme-pay=collecting-gateway")
				.run(context -> assertThat(context).hasSingleBean(MoneyPathAlertCheck.class));
	}
}
