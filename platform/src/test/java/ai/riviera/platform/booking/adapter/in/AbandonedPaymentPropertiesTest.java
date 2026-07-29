package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The abandoned-payment TTL as <em>bound, validated</em> configuration (#426).
 *
 * <p>This is the money path: the sweep this TTL drives cancels a PaymentIntent and releases the
 * booking's {@code (set, date)} claim (invariant #2). {@code PT0S} makes {@code now.minus(ttl)} equal
 * {@code now}, so every {@code AWAITING_PAYMENT} booking is expirable the instant it is inserted — the
 * set is returned to the pool under a tourist who is still in Stripe checkout, and nothing anywhere
 * reports a fault. The opposite typo is quieter still: past a day the sweep can no longer return a set
 * in time to be sold for the date it was claimed for, because bookings close the evening before
 * (invariant #4), so the sweep runs forever and frees nothing that matters.
 *
 * <p><strong>Why a compact constructor and not {@code @Validated} + {@code @Min}.</strong> There is no
 * JSR-303 implementation on the runtime classpath — #97 declined {@code spring-boot-starter-validation}
 * deliberately, in favour of explicit checks in records — and Boot only validates
 * {@code @ConfigurationProperties} when an implementation is present. An annotation here would bind and
 * validate <em>nothing</em>: the same silent degradation, arrived at from the other side.
 *
 * <p>The context-level tests earn their place alongside the direct-construction ones because only they
 * show that Boot's binder <em>propagates</em> the record's exception into a startup failure rather than
 * swallowing it and falling back to a default. Each asserts the root cause and message, not merely
 * {@code hasFailed()}: any bind or bean-creation error satisfies the weaker assertion.
 */
class AbandonedPaymentPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(AbandonedPaymentProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedTtl() {
		runner.run(context -> assertThat(context.getBean(AbandonedPaymentProperties.class).ttl())
				.as("unset config must reproduce today's behaviour exactly")
				.isEqualTo(Duration.ofMinutes(15)));
	}

	@Test
	void aNonPositiveTtlFailsTheContext() {
		runner.withPropertyValues("booking.awaiting-payment.ttl=PT0S")
				.run(context -> assertThat(context)
						.as("now.minus(PT0S) is now, so the sweep reaps a booking the instant it is "
								+ "created — releasing the set under a payer mid-checkout")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("booking.awaiting-payment.ttl"));
	}

	@Test
	void aTtlBelowTheFloorFailsTheContext() {
		runner.withPropertyValues("booking.awaiting-payment.ttl=PT10S")
				.run(context -> assertThat(context)
						.as("a small-but-positive TTL reaps live payers the same way, just less often")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("booking.awaiting-payment.ttl"));
	}

	@Test
	void anOversizedTtlFailsTheContext() {
		runner.withPropertyValues("booking.awaiting-payment.ttl=PT48H")
				.run(context -> assertThat(context)
						.as("past a day the sweep cannot free a set before its own booking date, since "
								+ "bookings close the evening before (invariant #4)")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("booking.awaiting-payment.ttl"));
	}

	@Test
	void acceptsTheWholeTtlRangeButNotBeyondIt() {
		assertThat(new AbandonedPaymentProperties(AbandonedPaymentProperties.MIN_TTL).ttl())
				.as("the bounds bound the typo, not the operator — both ends are reachable")
				.isEqualTo(AbandonedPaymentProperties.MIN_TTL);
		assertThat(new AbandonedPaymentProperties(AbandonedPaymentProperties.MAX_TTL).ttl())
				.isEqualTo(AbandonedPaymentProperties.MAX_TTL);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> new AbandonedPaymentProperties(
						AbandonedPaymentProperties.MIN_TTL.minusSeconds(1)))
				.withMessageContaining("booking.awaiting-payment.ttl");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new AbandonedPaymentProperties(
						AbandonedPaymentProperties.MAX_TTL.plusSeconds(1)));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new AbandonedPaymentProperties(Duration.ofMinutes(-15)));
	}

	/** Unset config binds null — the guard must run AFTER the defaulting, never before. */
	@Test
	void unsetTtlStillDefaults() {
		assertThat(new AbandonedPaymentProperties(null).ttl()).isEqualTo(Duration.ofMinutes(15));
	}
}
