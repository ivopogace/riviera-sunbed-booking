package ai.riviera.platform.booking.adapter.in;

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
 * The trap #383 sprang and this slice re-arms, pinned in the configuration #383 never had: <strong>two
 * bulkhead executors in one context</strong> (#404 AC-6).
 *
 * <p>Boot declares {@code applicationTaskExecutor} {@code @ConditionalOnMissingBean(Executor.class)}, so
 * merely <em>defining</em> an {@link Executor} bean makes it back off and not define the shared pool at
 * all. Unqualified {@code @Async} — every money-path listener — then falls through to an unbounded
 * {@code SimpleAsyncTaskExecutor}, one fresh thread per event, and <em>every test still passes</em>,
 * because unbounded threads always keep up. A bulkhead would have removed a bound from the exact path it
 * was written to protect. {@code defaultCandidate = false} is the fix: the bean stays addressable by
 * name, which is all {@code @Async} needs, while staying invisible to by-type resolution, which is all
 * Boot's condition consults.
 *
 * <p><strong>Why this test exists when {@code RegistryMailExecutorWiringIT} already asserts the same
 * thing.</strong> That test proves the condition survives <em>one</em> excluded executor. Nothing proved
 * it survives two — and "the flag worked last time" is precisely the reasoning that would let the second
 * one ship broken, silently, with a green suite. The assertion is cheap; the failure mode is a money-path
 * outage that no other test can see.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RefundExecutorWiringIT {

	private static final String APPLICATION_TASK_EXECUTOR = "applicationTaskExecutor";

	/** #383's mail bulkhead, by name — see {@link #bothBulkheadExecutorsAreAddressableByNameAndDistinct}. */
	private static final String MAIL_EXECUTOR_BEAN = "registryMailExecutor";

	@Autowired
	ApplicationContext context;

	@Test
	void declaringASecondBulkheadExecutorDoesNotSuppressBootsSharedPool() {
		assertThat(context.containsBean(APPLICATION_TASK_EXECUTOR))
				.as("Boot backs off applicationTaskExecutor when any Executor bean is visible by type; "
						+ "without defaultCandidate=false on BOTH bulkhead pools the money path loses its "
						+ "bounded executor")
				.isTrue();
	}

	@Test
	void unqualifiedAsyncStillResolvesToBootsSharedPool() {
		AsyncConfigurer configurer = context.getBean(AsyncConfigurer.class);

		assertThat(configurer.getAsyncExecutor())
				.as("PaymentEventListener and payout's accrual/reversal listeners carry a bare @Async; it "
						+ "must land on Boot's bounded pool, neither on a bulkhead pool nor on an unbounded "
						+ "SimpleAsyncTaskExecutor")
				.isSameAs(context.getBean(APPLICATION_TASK_EXECUTOR));
	}

	/**
	 * The mail bulkhead is deliberately identified by bean <em>name</em> rather than by importing
	 * {@code RegistryMailExecutorConfig.MAIL_EXECUTOR}: that class is package-private inside
	 * {@code notification}, and reaching into another module's adapter package — even from a test —
	 * is the boundary smell invariant #11 exists to prevent. The literal is checked against the real
	 * context here, so a rename fails this test rather than silently weakening it into a tautology.
	 */
	@Test
	void bothBulkheadExecutorsAreAddressableByNameAndDistinct() {
		Executor refunds = context.getBean(RefundExecutorConfig.REFUND_EXECUTOR, Executor.class);

		assertThat(context.containsBean(MAIL_EXECUTOR_BEAN))
				.as("the mail bulkhead must still be in the context — this test is about two excluded "
						+ "executors coexisting, so it proves nothing if only one is present")
				.isTrue();
		assertThat(refunds)
				.as("defaultCandidate=false must not cost the bean its name — @Async(REFUND_EXECUTOR) needs it")
				.isNotSameAs(context.getBean(APPLICATION_TASK_EXECUTOR))
				.as("a degraded gateway must not be able to starve mail, nor a degraded relay refunds; "
						+ "one shared bulkhead pool would reintroduce the coupling at a smaller scale")
				.isNotSameAs(context.getBean(MAIL_EXECUTOR_BEAN, Executor.class));
	}

	/**
	 * The half the unit tests cannot reach: that the pool the <em>container</em> builds carries the
	 * shipped bounds. {@code RefundExecutorConfigTest} feeds the factory a hand-written record and
	 * {@code RefundExecutorPropertiesTest} binds properties without touching a pool, so without this the
	 * two halves would be joined only by the same literals appearing in two files.
	 */
	@Test
	void theRefundExecutorIsBuiltFromTheShippedBounds() {
		ThreadPoolTaskExecutor pool =
				context.getBean(RefundExecutorConfig.REFUND_EXECUTOR, ThreadPoolTaskExecutor.class);

		assertThat(pool.getCorePoolSize()).isEqualTo(RefundExecutorProperties.DEFAULT_POOL_SIZE);
		assertThat(pool.getMaxPoolSize()).isEqualTo(RefundExecutorProperties.DEFAULT_POOL_SIZE);
		assertThat(pool.getQueueCapacity())
				.as("unset config must reproduce the shipped bounds through the real binder, not just "
						+ "through a record a unit test wrote by hand")
				.isEqualTo(RefundExecutorProperties.DEFAULT_QUEUE_CAPACITY);
	}
}
