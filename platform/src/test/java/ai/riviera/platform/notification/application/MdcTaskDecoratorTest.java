package ai.riviera.platform.notification.application;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

/**
 * The module's one MDC-propagation mechanism (#410), specified once here rather than twice in the two
 * vehicles that use it.
 *
 * <p><strong>The capture point is the whole contract.</strong> {@link MdcTaskDecorator#decorate} must
 * read the context on the <em>submitting</em> thread — which is where Spring's
 * {@code ThreadPoolTaskExecutor} calls it, before the task reaches the queue. Capturing inside the
 * returned {@link Runnable} instead would read the worker's own (empty) context and still satisfy a
 * naive "the worker saw corr-1" assertion whenever the test submits and runs on the same thread. So
 * {@link #capturesOnTheSubmittingThreadAndRestoresOnTheRunningOne} clears the submitting thread's MDC
 * <em>after</em> decorating and runs the task on a different thread: only a capture taken at decorate
 * time can survive that.
 */
class MdcTaskDecoratorTest {

	private static final String CORRELATION_KEY = "correlationId";

	private static final int AWAIT_SECONDS = 5;

	private final MdcTaskDecorator decorator = new MdcTaskDecorator();

	@AfterEach
	void clearContext() {
		MDC.clear();
	}

	@Test
	void capturesOnTheSubmittingThreadAndRestoresOnTheRunningOne() throws Exception {
		AtomicReference<String> seen = new AtomicReference<>();
		MDC.put(CORRELATION_KEY, "corr-1");

		Runnable decorated = decorator.decorate(() -> seen.set(MDC.get(CORRELATION_KEY)));
		MDC.clear();

		try (ExecutorService worker = Executors.newSingleThreadExecutor()) {
			worker.submit(decorated).get(AWAIT_SECONDS, TimeUnit.SECONDS);
		}

		assertThat(seen.get())
				.as("the context must be captured where decorate() runs — the submitting thread")
				.isEqualTo("corr-1");
	}

	@Test
	void clearsTheContextAfterTheTask() throws Exception {
		AtomicReference<String> leaked = new AtomicReference<>("never ran");
		MDC.put(CORRELATION_KEY, "corr-1");
		Runnable first = decorator.decorate(() -> { });
		MDC.clear();
		Runnable second = decorator.decorate(() -> leaked.set(MDC.get(CORRELATION_KEY)));

		try (ExecutorService worker = Executors.newSingleThreadExecutor()) {
			worker.submit(first).get(AWAIT_SECONDS, TimeUnit.SECONDS);
			worker.submit(second).get(AWAIT_SECONDS, TimeUnit.SECONDS);
		}

		assertThat(leaked.get())
				.as("one request's correlation id must not label the next request's mail")
				.isNull();
	}

	@Test
	void clearsTheContextEvenWhenTheTaskThrows() {
		MDC.put(CORRELATION_KEY, "corr-1");
		Runnable decorated = decorator.decorate(() -> {
			throw new IllegalStateException("transport down");
		});
		MDC.clear();

		assertThatIllegalStateException()
				.as("the failure must still propagate — the registry vehicle needs it to stay outstanding")
				.isThrownBy(decorated::run);

		assertThat(MDC.get(CORRELATION_KEY))
				.as("a failed send is exactly when the context must not linger on the pooled thread")
				.isNull();
	}

	@Test
	void toleratesAnAbsentCallerContext() throws Exception {
		AtomicBoolean ran = new AtomicBoolean();
		MDC.clear();

		Runnable decorated = decorator.decorate(() -> ran.set(true));

		try (ExecutorService worker = Executors.newSingleThreadExecutor()) {
			worker.submit(decorated).get(AWAIT_SECONDS, TimeUnit.SECONDS);
		}

		assertThat(ran)
				.as("a send submitted outside a request — the restart republish — has no context to carry")
				.isTrue();
	}
}
