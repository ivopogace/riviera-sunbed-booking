package ai.riviera.platform.customer.adapter.in;

import java.time.LocalDate;
import java.time.Period;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The retention sweep's two knobs as <em>bound, validated</em> configuration (#414).
 *
 * <p>Both degenerate values boot cleanly and are invisible, in opposite directions.
 * {@code batch-size=0} reaches {@code LIMIT 0}, so the scheduled sweep finds no candidates and returns
 * on its empty-list branch <strong>without logging anything</strong> — the single {@code log.info} is
 * guarded by {@code scrubbed > 0} and the scheduler discards the return value — scrubbing nothing for
 * as long as it stays set. Because retention ships disabled, that would most likely be discovered only
 * after enabling it in production, i.e. exactly when the GDPR obligation it implements has started
 * counting, with no log line to say the sweep was inert. {@code window=P0D} fails the other way: it
 * puts the cutoff at <em>today</em>, so the FIRST sweep scrubs every guest contact with no booking on
 * or after today, irreversibly (ADR-0010, pseudonymize-in-place) — no later config fix undoes it.
 *
 * <p><strong>Why a compact constructor and not {@code @Validated} + {@code @Min}.</strong> There is
 * no JSR-303 implementation on the runtime classpath — #97 declined
 * {@code spring-boot-starter-validation} deliberately, in favour of explicit checks in records — and
 * Boot only validates {@code @ConfigurationProperties} when an implementation is present. An
 * annotation here would therefore bind and validate <em>nothing</em>: the same silent degradation,
 * arrived at from the other side.
 *
 * <p>The context-level tests earn their place alongside the direct-construction ones because only
 * they show that Boot's binder <em>propagates</em> the record's exception into a startup failure
 * rather than swallowing it and falling back to a default. Each asserts the root cause and message,
 * not merely {@code hasFailed()}: any bind or bean-creation error satisfies the weaker assertion, so
 * it would stay green with the guard gone. Uses {@link ApplicationContextRunner} plus
 * {@link ConfigDataApplicationContextInitializer} so the real {@code application.properties} is
 * evaluated without a Spring Boot context, no web layer and no Docker — the
 * {@code RegistryMailPropertiesTest} sibling pattern.
 */
class CustomerRetentionPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(CustomerRetentionProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedDefaults() {
		runner.run(context -> {
			CustomerRetentionProperties props = context.getBean(CustomerRetentionProperties.class);

			assertThat(props.window())
					.as("unset config must reproduce today's deliberately inert window exactly")
					.isEqualTo(Period.ofYears(10));
			assertThat(props.batchSize()).isEqualTo(500);
		});
	}

	@Test
	void aNonPositiveBatchSizeFailsTheContext() {
		runner.withPropertyValues("customer.retention.batch-size=0")
				.run(context -> assertThat(context)
						.as("LIMIT 0 finds no candidates, so the sweep scrubs nothing and logs nothing")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("batch-size"));
	}

	@Test
	void anOversizedBatchSizeFailsTheContext() {
		runner.withPropertyValues("customer.retention.batch-size=100000")
				.run(context -> assertThat(context)
						.as("the batch IS the transaction bound; it also expands into an IN (:guests) list "
								+ "PostgreSQL caps at 65535 bind parameters")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("batch-size"));
	}

	@Test
	void aNonPositiveWindowFailsTheContext() {
		runner.withPropertyValues("customer.retention.window=P0D")
				.run(context -> assertThat(context)
						.as("a zero window puts the cutoff at today, so the first sweep scrubs every guest "
								+ "contact with no booking on or after today — irreversibly")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("window"));
	}

	@Test
	void aNegativeWindowFailsTheContext() {
		runner.withPropertyValues("customer.retention.window=P-1Y")
				.run(context -> assertThat(context)
						.as("a negative window puts the cutoff in the FUTURE and scrubs more still")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("window"));
	}

	@Test
	void acceptsTheWholeBatchTuningRangeButNotBeyondIt() {
		assertThat(new CustomerRetentionProperties(Period.ofYears(2), 1).batchSize())
				.as("the bounds bound the typo, not the operator — both ends are reachable")
				.isEqualTo(1);
		assertThat(new CustomerRetentionProperties(Period.ofDays(1), CustomerRetentionProperties.MAX_BATCH_SIZE)
				.batchSize())
				.isEqualTo(CustomerRetentionProperties.MAX_BATCH_SIZE);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.ofYears(2), 0))
				.withMessageContaining("batch-size");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.ofYears(2), -1));
		assertThatIllegalArgumentException().isThrownBy(() -> new CustomerRetentionProperties(
				Period.ofYears(2), CustomerRetentionProperties.MAX_BATCH_SIZE + 1));
	}

	@Test
	void rejectsANonPositiveWindow() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.ZERO, 500))
				.withMessageContaining("window");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.ofYears(-1), 500));
	}

	/**
	 * A mixed-sign {@link Period} is rejected <em>deliberately</em>, not incidentally — pinned because
	 * the obvious "improvement" is to compare a net duration instead, and that would be a real
	 * regression. {@code Period} holds independent years/months/days with no reference date, so
	 * {@code P1M-40D} reports {@code toTotalMonths() == 1} — positive by that measure — yet subtracting
	 * it moves the cutoff FORWARD, which is precisely the future-dated cutoff the guard exists to stop.
	 * Rejecting any negative component is the only check a net-duration test cannot slip past; refusing
	 * the chronologically-harmless {@code P2Y-1M} alongside it is the accepted cost of that, for an
	 * operation ADR-0010 makes irreversible.
	 */
	@Test
	void rejectsAMixedSignWindowEvenWhenItsNetDurationLooksPositive() {
		Period futureDatedCutoff = Period.parse("P1M-40D");
		assertThat(futureDatedCutoff.toTotalMonths())
				.as("reads positive by net duration, which is exactly why a net-duration guard would fail")
				.isEqualTo(1);
		assertThat(LocalDate.of(2026, 7, 29).minus(futureDatedCutoff))
				.as("subtracting it moves the cutoff forward — every guest contact becomes a candidate")
				.isAfter(LocalDate.of(2026, 7, 29));

		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(futureDatedCutoff, 500))
				.withMessageContaining("window");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new CustomerRetentionProperties(Period.parse("P2Y-1M"), 500));
	}

	/** Unset config is null on BOTH components — the guards must run AFTER the defaulting, never before. */
	@Test
	void unsetComponentsStillDefaultRatherThanTrippingTheGuards() {
		assertThat(new CustomerRetentionProperties(null, null))
				.isEqualTo(new CustomerRetentionProperties(Period.ofYears(10), 500));
	}
}
