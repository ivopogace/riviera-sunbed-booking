package ai.riviera.platform.notification.adapter.in;

import java.util.concurrent.Executor;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The trap that adding {@link RegistryMailExecutorConfig} sprang, pinned so it cannot spring again.
 *
 * <p>Boot's {@code applicationTaskExecutor} is declared {@code @ConditionalOnMissingBean(Executor.class)}:
 * defining <em>any</em> {@link Executor} bean makes Boot back off and not define it at all. A mail
 * executor is an {@code Executor} bean, so #383's first cut silently deleted the shared pool from the
 * context — and with it the bounded pool the money-path listeners run on. {@code @Async} then fell
 * through to an unbounded {@code SimpleAsyncTaskExecutor} (a fresh thread per event, forever), which
 * is why <em>every</em> test still passed, {@code RegistryMailBulkheadIT} included: unbounded threads
 * always keep up. The bulkhead would have shipped having removed a bound from the very path it was
 * written to protect.
 *
 * <p>{@code defaultCandidate = false} on the mail bean is the fix — it keeps the bean addressable by
 * name for {@code @Async(MAIL_EXECUTOR)} while excluding it from by-type resolution, so Boot's
 * condition no longer sees an {@code Executor} and declares the shared pool as usual. It looks like a
 * decoration and is load-bearing; that is precisely why it needs a test rather than a comment.
 *
 * <p>Both halves are asserted: the bean exists, <em>and</em> unqualified {@code @Async} still resolves
 * to it. The second is the one that matters — a context could hold {@code applicationTaskExecutor} and
 * still hand the money path somewhere else.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RegistryMailExecutorWiringIT {

	private static final String APPLICATION_TASK_EXECUTOR = "applicationTaskExecutor";

	@Autowired
	ApplicationContext context;

	@Test
	void declaringTheMailExecutorDoesNotSuppressBootsSharedPool() {
		assertThat(context.containsBean(APPLICATION_TASK_EXECUTOR))
				.as("Boot backs off applicationTaskExecutor when any Executor bean exists; without "
						+ "defaultCandidate=false on the mail pool the money path loses its bounded executor")
				.isTrue();
	}

	@Test
	void unqualifiedAsyncStillResolvesToBootsSharedPool() {
		AsyncConfigurer configurer = context.getBean(AsyncConfigurer.class);

		assertThat(configurer.getAsyncExecutor())
				.as("the money-path listeners carry a bare @Async; it must land on Boot's bounded pool, "
						+ "neither on the two-thread mail pool nor on an unbounded SimpleAsyncTaskExecutor")
				.isSameAs(context.getBean(APPLICATION_TASK_EXECUTOR));
	}

	@Test
	void theMailExecutorIsStillAddressableByName() {
		assertThat(context.getBean(RegistryMailExecutorConfig.MAIL_EXECUTOR, Executor.class))
				.as("defaultCandidate=false must not cost the bean its name — @Async(MAIL_EXECUTOR) needs it")
				.isNotSameAs(context.getBean(APPLICATION_TASK_EXECUTOR));
	}

	/**
	 * The half of #408's AC-1 the unit tests cannot reach: that the pool the <em>container</em> builds
	 * carries the shipped bounds. {@code RegistryMailExecutorConfigTest} feeds the factory a
	 * hand-written record and {@code RegistryMailPropertiesTest} binds the properties without touching
	 * a pool, so before this test the two halves were joined only by the same literals appearing in
	 * two files.
	 */
	@Test
	void theMailExecutorIsBuiltFromTheShippedBounds() {
		ThreadPoolTaskExecutor pool =
				context.getBean(RegistryMailExecutorConfig.MAIL_EXECUTOR, ThreadPoolTaskExecutor.class);

		assertThat(pool.getCorePoolSize()).isEqualTo(2);
		assertThat(pool.getMaxPoolSize()).isEqualTo(2);
		assertThat(pool.getQueueCapacity())
				.as("unset config must reproduce #383's constants through the real binder, not just "
						+ "through a record a unit test wrote by hand")
				.isEqualTo(200);
	}
}
