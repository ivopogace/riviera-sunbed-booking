package ai.riviera.platform.notification.application;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

/**
 * Production {@link MailDispatcher} (#369): a small bounded in-memory pool that takes the SMTP round-trip
 * off the request thread, closing the timing account-enumeration oracle the real {@code SmtpMailer} (#368)
 * opened on the known-email branch of {@code register} / {@code forgot-password}.
 *
 * <p><strong>The pool is deliberately its own.</strong> Boot's shared {@code applicationTaskExecutor} is
 * what Spring Modulith's {@code @ApplicationModuleListener}s run on — the payment→booking confirmation and
 * booking→payout accrual spine — so a degraded relay sharing it could back up the money path. It is
 * bounded for the complementary reason: a saturated dispatcher drops the send (the user can re-request)
 * rather than queueing without limit or, worse, falling back to running the send on the caller's thread,
 * which would re-open the very oracle this class exists to close.
 *
 * <p>The caller's logging context rides along so a failed send stays traceable to its request (the
 * correlation id from {@code CorrelationIdFilter}), and is cleared afterwards so it cannot leak onto the
 * next task sharing the pooled thread. Package-private (RV-BE-11); pinned by {@code AsyncMailDispatcherTest}.
 *
 * <p><strong>One drainer thread, deliberately</strong> — recovery mail is a handful of sends a day, and a
 * serial drain behind a 100-deep buffer is the whole requirement. Core and max are equal on purpose: a
 * {@code ThreadPoolExecutor} grows past its core size only once the queue is <em>full</em>, so a larger max
 * with this queue would add no headroom until 100 sends were already backed up — an inviting number to
 * "tune" and a misleading one to read. A stuck send cannot stall the queue indefinitely because
 * {@code SmtpMailer}'s connect/read/write timeouts are finite (#368).
 */
@Component
class AsyncMailDispatcher implements MailDispatcher, DisposableBean {

	private static final Logger log = LoggerFactory.getLogger(AsyncMailDispatcher.class);

	private static final int POOL_SIZE = 1;
	private static final int QUEUE_CAPACITY = 100;
	private static final int SHUTDOWN_DRAIN_SECONDS = 5;
	private static final String THREAD_NAME_PREFIX = "recovery-mail-";

	private final ThreadPoolTaskExecutor executor;

	AsyncMailDispatcher() {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(POOL_SIZE);
		pool.setMaxPoolSize(POOL_SIZE);
		pool.setQueueCapacity(QUEUE_CAPACITY);
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		// A redeploy must not silently swallow a reset link a user is already waiting for.
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationSeconds(SHUTDOWN_DRAIN_SECONDS);
		pool.initialize();
		this.executor = pool;
	}

	@Override
	public void dispatch(Runnable send) {
		Map<String, String> callerContext = MDC.getCopyOfContextMap();
		try {
			executor.execute(() -> runWithin(callerContext, send));
		}
		catch (TaskRejectedException e) {
			// Never the address or the link (invariant #7); the token is issued, so the user can re-request.
			log.warn("Recovery email dispatch rejected ({}); the send was dropped", e.getClass().getSimpleName());
		}
	}

	private static void runWithin(Map<String, String> callerContext, Runnable send) {
		if (callerContext != null) {
			MDC.setContextMap(callerContext);
		}
		try {
			send.run();
		}
		finally {
			MDC.clear();
		}
	}

	@Override
	public void destroy() {
		executor.shutdown();
	}
}
