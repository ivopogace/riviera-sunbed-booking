package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import ai.riviera.platform.booking.application.refund.RefundResubmissionWindow;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The refund-resubmit cooldown as <em>bound, validated</em> configuration (#454, AC-9) — the
 * {@code MailResubmissionPropertiesTest} shape on the money path, for a knob whose right value is
 * unknowable until the {@code stripe} profile takes real incident traffic.
 *
 * <p>The lower bound is the load-shaped half: a near-zero cooldown boots cleanly and reduces the
 * sweep throttle to the single-flight lock alone, so a held-down button during a gateway outage
 * re-asks the gateway for every outstanding refund on every press. The money stays safe (idempotency
 * keys), but the gateway that is already failing takes the storm and every press reports success.
 *
 * <p>The context-level tests assert the root cause and its message, not merely {@code hasFailed()} —
 * any bind error at all would satisfy the weaker assertion.
 */
class RefundResubmissionPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(RefundResubmissionConfig.class);

	@Test
	void bindsTheShippedDefaultAndMapsItToTheWindow() {
		runner.run(context -> {
			assertThat(context.getBean(RefundResubmissionProperties.class).cooldownMs()).isEqualTo(60_000);
			assertThat(context.getBean(RefundResubmissionWindow.class))
					.as("the application layer sees a Duration, never the millisecond config type")
					.isEqualTo(new RefundResubmissionWindow(Duration.ofMinutes(1)));
		});
	}

	@Test
	void theEnvironmentOverridesTheCooldown() {
		runner.withSystemProperties("RIVIERA_REFUND_RESUBMIT_COOLDOWN_MS=90000").run(context -> assertThat(
				context.getBean(RefundResubmissionWindow.class).cooldown())
						.as("the window must be retunable from the deploy environment")
						.isEqualTo(Duration.ofSeconds(90)));
	}

	@Test
	void aZeroCooldownFailsTheContext() {
		runner.withPropertyValues("riviera.booking.refund-resubmission.cooldown-ms=0")
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
		runner.withPropertyValues("riviera.booking.refund-resubmission.cooldown-ms=86400000")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("cooldown-ms"));
	}

	@Test
	void rejectsACooldownTooShortToThrottleASweep() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RefundResubmissionProperties(0))
				.withMessageContaining("cooldown-ms");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RefundResubmissionProperties(RefundResubmissionProperties.MIN_COOLDOWN_MS - 1));
		assertThatIllegalArgumentException().isThrownBy(() -> new RefundResubmissionProperties(-1));
	}

	@Test
	void rejectsACooldownThatWouldOutlastTheIncident() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RefundResubmissionProperties(RefundResubmissionProperties.MAX_COOLDOWN_MS + 1))
				.withMessageContaining("cooldown-ms");
	}

	/** The window is the application layer's own guard, so it refuses a degenerate value on its own. */
	@Test
	void theWindowRefusesANonPositiveDurationOfItsOwn() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RefundResubmissionWindow(Duration.ZERO))
				.withMessageContaining("cooldown");
		assertThatIllegalArgumentException().isThrownBy(() -> new RefundResubmissionWindow(null));
	}
}
