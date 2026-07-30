package ai.riviera.workercontextfixture;

import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * A deliberately mis-configured pool: it builds a {@code ThreadPoolTaskExecutor} and never gives it an
 * {@code MdcTaskDecorator}, so every line its workers emit is unattributable.
 *
 * <p>This is the shape #404 actually shipped, kept as a fixture so
 * {@code WorkerContextArchitectureTest}'s rule is proven to <strong>see</strong> it. Without this, a
 * detector that silently matched nothing would satisfy the rule trivially — which is precisely how the
 * gap this fixture describes reached production with a green build (the {@code ai.riviera.drainfixture}
 * mechanism, from issue #95).
 *
 * <p>Never referenced by production code and never instantiated by a test; it exists to be read as
 * bytecode.
 */
public final class UndecoratedWorkerPool {

	private UndecoratedWorkerPool() {
	}

	static ThreadPoolTaskExecutor pool() {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(1);
		pool.setQueueCapacity(1);
		pool.setThreadNamePrefix("undecorated-fixture-");
		return pool;
	}
}
