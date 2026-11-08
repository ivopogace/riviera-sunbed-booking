package ai.riviera.platform.payment.adapter.in;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import ai.riviera.platform.payment.application.PaymentReconciliation;

/** The sweep runs under any gateway that really collects, read through the {@code application.properties} that ships. */
class PaymentReconciliationGatewaySwitchTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(context -> context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withBean(PaymentReconciliation.class, () -> mock(PaymentReconciliation.class))
			.withBean(MeterRegistry.class, SimpleMeterRegistry::new)
			.withUserConfiguration(PaymentSchedulingConfig.class, PaymentReconciliationScheduler.class);

	@Test
	void activeUnderStripe() {
		runner.withPropertyValues("spring.profiles.active=stripe")
				.run(context -> assertThat(context).hasSingleBean(PaymentReconciliationScheduler.class));
	}

	@Test
	void absentUnderTheDefaultStub() {
		runner.run(context -> assertThat(context).hasNotFailed()
				.doesNotHaveBean(PaymentSchedulingConfig.class)
				.doesNotHaveBean(PaymentReconciliationScheduler.class));
	}

	@Test
	void activeUnderAnyProfileJoiningTheSwitch() {
		runner.withPropertyValues("spring.profiles.active=acme-pay",
						"spring.profiles.group.acme-pay=collecting-gateway")
				.run(context -> assertThat(context).hasSingleBean(PaymentReconciliationScheduler.class));
	}
}
