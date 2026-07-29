package ai.riviera.platform.notification.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The registry-mail pool's two bounds as <em>bound, validated</em> configuration (#408).
 *
 * <p>Externalising them is what lets #370 retune the pool when a real relay's latency is known for
 * the first time, without a code change, a PR and a deploy. Validating them is not decoration:
 * {@code ThreadPoolTaskExecutor.createQueue} returns a {@link java.util.concurrent.SynchronousQueue}
 * for <em>any</em> non-positive capacity, so {@code queue-capacity=0} — which reads as "unbounded"
 * to a human and means "capacity zero" to Spring — would silently convert the bulkhead into a pool
 * that sheds every send it cannot hand straight to a free thread. That is a worse failure than the
 * one #383 built the pool to prevent, and it would boot cleanly.
 *
 * <p><strong>Why a compact constructor and not {@code @Validated} + {@code @Min}.</strong> There is
 * no JSR-303 implementation on the runtime classpath — #97 declined
 * {@code spring-boot-starter-validation} deliberately, in favour of explicit checks in records — and
 * Boot only validates {@code @ConfigurationProperties} when an implementation is present. An
 * annotation here would therefore bind and validate <em>nothing</em>: the same silent degradation,
 * arrived at from the other side.
 *
 * <p>The context-level tests earn their place alongside the direct-construction ones for a different
 * reason than "the record test would still pass" — it would not; dropping the guard reddens
 * {@link #rejectsANonPositiveQueueCapacity} first. What only a context test can show is that Boot's
 * binder <em>propagates</em> the record's exception into a startup failure instead of swallowing it
 * and falling back to a default, which is the half the guard's usefulness actually rests on. Each one
 * asserts the root cause and message, not merely {@code hasFailed()}: any bind or bean-creation error
 * satisfies the weaker assertion, so it would stay green with the guard gone.
 */
class RegistryMailPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(RegistryMailProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedDefaults() {
		runner.run(context -> {
			RegistryMailProperties props = context.getBean(RegistryMailProperties.class);

			assertThat(props.poolSize())
					.as("unset config must reproduce the constants #383 shipped, exactly")
					.isEqualTo(2);
			assertThat(props.queueCapacity()).isEqualTo(200);
		});
	}

	@Test
	void theEnvironmentOverridesBothBounds() {
		runner.withSystemProperties(
				"RIVIERA_REGISTRY_MAIL_POOL_SIZE=4",
				"RIVIERA_REGISTRY_MAIL_QUEUE_CAPACITY=50")
				.run(context -> {
					RegistryMailProperties props = context.getBean(RegistryMailProperties.class);

					assertThat(props.poolSize())
							.as("#370 must be able to retune the pool from the deploy environment")
							.isEqualTo(4);
					assertThat(props.queueCapacity()).isEqualTo(50);
				});
	}

	@Test
	void aNonPositiveQueueCapacityFailsTheContext() {
		runner.withPropertyValues("riviera.notification.registry-mail.queue-capacity=0")
				.run(context -> assertThat(context)
						.as("a typo must fail the boot, not silently yield a SynchronousQueue")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("queue-capacity")
						.hasMessageContaining("SynchronousQueue"));
	}

	@Test
	void aNonPositivePoolSizeFailsTheContext() {
		runner.withPropertyValues("riviera.notification.registry-mail.pool-size=0")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("pool-size"));
	}

	@Test
	void anOversizedQueueCapacityFailsTheContext() {
		runner.withPropertyValues("riviera.notification.registry-mail.queue-capacity=1000000")
				.run(context -> assertThat(context)
						.as("an oversized queue boots clean and sheds nothing — it is the unbounded queue "
								+ "the bulkhead removed, restored by configuration")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("queue-capacity"));
	}

	@Test
	void anOversizedPoolSizeFailsTheContext() {
		runner.withPropertyValues("riviera.notification.registry-mail.pool-size=200")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("pool-size"));
	}

	@Test
	void rejectsANonPositiveQueueCapacity() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RegistryMailProperties(2, 0))
				.withMessageContaining("queue-capacity")
				.withMessageContaining("SynchronousQueue");
		assertThatIllegalArgumentException().isThrownBy(() -> new RegistryMailProperties(2, -1));
	}

	@Test
	void rejectsANonPositivePoolSize() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RegistryMailProperties(0, 200))
				.withMessageContaining("pool-size");
		assertThatIllegalArgumentException().isThrownBy(() -> new RegistryMailProperties(-1, 200));
	}

	@Test
	void acceptsTheWholeTuningRangeButNotBeyondIt() {
		assertThat(new RegistryMailProperties(1, 1).poolSize()).isEqualTo(1);
		assertThat(new RegistryMailProperties(RegistryMailProperties.MAX_POOL_SIZE,
				RegistryMailProperties.MAX_QUEUE_CAPACITY).queueCapacity())
				.as("the ceilings bound the typo, not the operator — both are reachable")
				.isEqualTo(RegistryMailProperties.MAX_QUEUE_CAPACITY);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RegistryMailProperties(RegistryMailProperties.MAX_POOL_SIZE + 1, 200));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RegistryMailProperties(2, RegistryMailProperties.MAX_QUEUE_CAPACITY + 1));
	}
}
