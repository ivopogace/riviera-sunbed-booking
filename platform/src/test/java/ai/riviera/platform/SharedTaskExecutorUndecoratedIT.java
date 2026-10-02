package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.task.ThreadPoolTaskExecutorCustomizer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Boot's shared {@code applicationTaskExecutor} carries the invariant-#8/#9 spine listeners and stays undecorated
 * (RESPONSIBILITIES.md §{@code monitoring}); {@code WorkerContextArchitectureTest} cannot see it, being
 * auto-configured. A library's {@code ThreadPoolTaskExecutorCustomizer} or a {@code TaskDecorator} bean would
 * decorate it silently, so the built pool is read here.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SharedTaskExecutorUndecoratedIT {

	private static final String APPLICATION_TASK_EXECUTOR = "applicationTaskExecutor";

	/** A bulkhead pool, by name, as the probe's positive control (it composes an {@code MdcTaskDecorator}). */
	private static final String REFUND_EXECUTOR = "bookingRefundExecutor";

	@Autowired
	ApplicationContext context;

	@Test
	void bootsSharedPoolCarriesNoTaskDecorator() {
		assertNull(decoratorOf(APPLICATION_TASK_EXECUTOR),
				"something decorated the money-path spine's pool; find the customizer or TaskDecorator bean");
	}

	@Test
	void nothingInTheContextWouldDecorateBootsPools() {
		assertEquals(0, context.getBeanNamesForType(TaskDecorator.class).length,
				"Boot applies a TaskDecorator bean to applicationTaskExecutor and its scheduler; build it with new");
		assertEquals(0, context.getBeanNamesForType(ThreadPoolTaskExecutorCustomizer.class).length,
				"a ThreadPoolTaskExecutorCustomizer reaches applicationTaskExecutor");
	}

	@Test
	void theProbeReadsABulkheadPoolAsDecorated() {
		assertNotNull(decoratorOf(REFUND_EXECUTOR), "the probe must see a decorator where one is installed");
	}

	private Object decoratorOf(String poolName) {
		return ReflectionTestUtils.getField(context.getBean(poolName, ThreadPoolTaskExecutor.class), "taskDecorator");
	}
}
