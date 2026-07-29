package ai.riviera.platform.notification.adapter.in;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The saturation contract of the registry-mail executor (#383 AC-2). The pool exists to be a
 * <strong>bulkhead</strong>, so the two properties that make it one are asserted rather than left to
 * a reader of the builder: it is <em>bounded</em> on every axis (threads and queue), and once both
 * are full it <em>sheds</em> — the submission neither throws back at the caller nor runs the task on
 * the caller's thread.
 *
 * <p>Both halves of the shed matter and neither is the default. A throw would surface on the thread
 * committing the booking transaction (an {@code AFTER_COMMIT} listener is invoked from inside
 * {@code commit()}), which is the money path this pool exists to protect; and a caller-runs fallback
 * would put the SMTP round-trip on that same thread — the exact failure #383 is about, arrived at
 * from the other direction. The shed work is not lost: its Event Publication Registry row is still
 * outstanding, so the next restart republishes it.
 *
 * <p>No Spring context — the configuration is exercised as the plain factory it is, standing in for
 * the container's own {@code afterPropertiesSet()} call.
 */
class RegistryMailExecutorConfigTest {

	private static final long RELEASE_TIMEOUT_SECONDS = 10;

	private static ThreadPoolTaskExecutor initializedExecutor() {
		ThreadPoolTaskExecutor pool = new RegistryMailExecutorConfig().registryMailExecutor();
		pool.afterPropertiesSet();
		return pool;
	}

	@Test
	void isBoundedOnEveryAxis() {
		ThreadPoolTaskExecutor pool = initializedExecutor();
		try {
			assertEquals(RegistryMailExecutorConfig.POOL_SIZE, pool.getCorePoolSize());
			assertEquals(RegistryMailExecutorConfig.POOL_SIZE, pool.getMaxPoolSize(),
					"max must equal core: a ThreadPoolExecutor grows past core only once the queue is "
							+ "full, so a larger max would add no headroom until the queue already had");
			assertEquals(RegistryMailExecutorConfig.QUEUE_CAPACITY, pool.getQueueCapacity(),
					"an unbounded queue is what makes a degraded relay a starvation source");
		}
		finally {
			pool.shutdown();
		}
	}

	@Test
	void shedsOnSaturationWithoutThrowingOrRunningOnTheCallerThread() throws Exception {
		ThreadPoolTaskExecutor pool = initializedExecutor();
		CountDownLatch gate = new CountDownLatch(1);
		CountDownLatch wedged = new CountDownLatch(RegistryMailExecutorConfig.POOL_SIZE);
		AtomicBoolean shedTaskRan = new AtomicBoolean();
		List<Future<?>> accepted = new ArrayList<>();

		try {
			int capacity = RegistryMailExecutorConfig.POOL_SIZE + RegistryMailExecutorConfig.QUEUE_CAPACITY;
			for (int i = 0; i < capacity; i++) {
				accepted.add(pool.submit(() -> {
					wedged.countDown();
					awaitQuietly(gate);
				}));
			}
			assertTrue(wedged.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS),
					"every worker thread should be occupied before the pool is pushed past capacity");

			// The submission a saturated pool must absorb: no exception reaches this thread…
			Future<?> shed = pool.submit(() -> shedTaskRan.set(true));

			assertFalse(shed.isDone(),
					"a shed task yields a Future that never completes — nothing may ever wait on it");
			assertEquals(capacity, accepted.size());
		}
		finally {
			gate.countDown();
			pool.shutdown();
		}

		// …and the task is dropped rather than deferred: it stays unrun even after the pool drains.
		assertFalse(shedTaskRan.get(),
				"a shed send must not run on the caller's thread, now or later; the registry keeps the work");
	}

	private static void awaitQuietly(CountDownLatch gate) {
		try {
			gate.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}
}
