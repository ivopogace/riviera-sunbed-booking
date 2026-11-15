package ai.riviera.platform.shared;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

/** The check aborts once, naming every guard's gap; guards with no gap, or none at all, let the boot through. */
class BootPostureCheckTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(BootPostureCheck.class);

	@Test
	void everyGapIsNamedInTheOneAbort() {
		runner.withUserConfiguration(TwoGaps.class, NoGap.class).run(context -> {
			assertThat(context).hasFailed();
			assertThat(context).getFailure().isInstanceOf(IllegalStateException.class)
					.hasMessageContaining("ADR-0031")
					.hasMessageContaining("first gap")
					.hasMessageContaining("second gap")
					.hasMessageNotContaining("Optional");
		});
	}

	@Test
	void aGuardWithNoGapLetsTheBootThrough() {
		runner.withUserConfiguration(NoGap.class).run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void noGuardLetsTheBootThrough() {
		runner.run(context -> assertThat(context).hasNotFailed());
	}

	@Test
	void aSecondEnvironmentBeanDoesNotConfuseTheCheck() {
		runner.withUserConfiguration(SecondEnvironment.class, NoGap.class)
				.run(context -> assertThat(context).hasNotFailed());
	}

	@Configuration(proxyBeanMethods = false)
	static class SecondEnvironment {

		@Bean
		StandardEnvironment anotherEnvironment() {
			return new StandardEnvironment();
		}
	}

	@Configuration(proxyBeanMethods = false)
	static class TwoGaps {

		@Bean
		BootPostureGuard second() {
			return environment -> Optional.of("second gap");
		}

		@Bean
		BootPostureGuard first() {
			return environment -> Optional.of("first gap");
		}
	}

	@Configuration(proxyBeanMethods = false)
	static class NoGap {

		@Bean
		BootPostureGuard satisfied() {
			return environment -> Optional.empty();
		}
	}
}
