package ai.riviera.platform.notification.adapter.in;

import java.time.Duration;

import ai.riviera.platform.notification.application.MailResubmissionWindow;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The resubmit cooldown as <em>bound, validated</em> configuration — the
 * {@link RegistryMailPropertiesTest} shape, for a knob whose right value is likewise unknowable until
 * a real relay's drain rate goes behind it.
 *
 * <p>The lower bound is the one that matters. A zero or near-zero cooldown boots cleanly and reduces
 * the duplicate guard to the single-flight lock alone — which cannot see a send still draining on
 * {@code registryMailExecutor}, because the registry only completes a publication once the
 * {@code @Async} listener returns. The result is the exact duplicate AC-3 forbids, arriving as
 * configuration rather than as code, with nothing failing anywhere.
 *
 * <p>The context-level tests carry a claim the direct-construction ones cannot: that Boot's binder
 * <em>propagates</em> the record's exception into a startup failure rather than swallowing it and
 * falling back to the default. Each asserts the root cause and its message, not merely
 * {@code hasFailed()} — any bind error at all would satisfy the weaker assertion.
 */
class MailResubmissionPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(MailResubmissionConfig.class);

	@Test
	void bindsTheShippedDefaultAndMapsItToTheWindow() {
		runner.run(context -> {
			assertThat(context.getBean(MailResubmissionProperties.class).cooldownMs()).isEqualTo(60_000);
			assertThat(context.getBean(MailResubmissionWindow.class))
					.as("the application layer sees a Duration, never the millisecond config type")
					.isEqualTo(new MailResubmissionWindow(Duration.ofMinutes(1)));
		});
	}

	@Test
	void theEnvironmentOverridesTheCooldown() {
		runner.withSystemProperties("RIVIERA_MAIL_RESUBMIT_COOLDOWN_MS=90000").run(context -> assertThat(
				context.getBean(MailResubmissionWindow.class).cooldown())
						.as("#370 must be able to retune the window from the deploy environment")
						.isEqualTo(Duration.ofSeconds(90)));
	}

	@Test
	void aZeroCooldownFailsTheContext() {
		runner.withPropertyValues("riviera.notification.mail-resubmission.cooldown-ms=0")
				.run(context -> assertThat(context)
						.as("a zero window boots clean and silently collapses the guard to the lock alone")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("cooldown-ms"));
	}

	@Test
	void anOversizedCooldownFailsTheContext() {
		runner.withPropertyValues("riviera.notification.mail-resubmission.cooldown-ms=86400000")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("cooldown-ms"));
	}

	@Test
	void rejectsACooldownTooShortToOutliveASend() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new MailResubmissionProperties(0))
				.withMessageContaining("cooldown-ms");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new MailResubmissionProperties(MailResubmissionProperties.MIN_COOLDOWN_MS - 1));
		assertThatIllegalArgumentException().isThrownBy(() -> new MailResubmissionProperties(-1));
	}

	@Test
	void rejectsACooldownThatWouldOutlastTheIncident() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new MailResubmissionProperties(MailResubmissionProperties.MAX_COOLDOWN_MS + 1))
				.withMessageContaining("cooldown-ms");
	}

	/** The window is the application layer's own guard, so it refuses a degenerate value on its own. */
	@Test
	void theWindowRefusesANonPositiveDurationOfItsOwn() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new MailResubmissionWindow(Duration.ZERO))
				.withMessageContaining("cooldown");
		assertThatIllegalArgumentException().isThrownBy(() -> new MailResubmissionWindow(null));
	}
}
