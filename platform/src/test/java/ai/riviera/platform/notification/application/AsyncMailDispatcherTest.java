package ai.riviera.platform.notification.application;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Unit spec for the production {@link MailDispatcher} (#369). A recovery-email send must leave the request
 * thread — that inline SMTP round-trip, taken only on the known-email branch, is the timing
 * account-enumeration oracle this slice closes — and it must land on a pool of its OWN, never Boot's shared
 * {@code applicationTaskExecutor}, which carries the Spring Modulith money-path listeners. A dispatch that
 * cannot be accepted is dropped, never thrown at the caller, whose HTTP response the send may not influence
 * (D-8).
 */
class AsyncMailDispatcherTest {

	private static final String CORRELATION_KEY = "correlationId";
	private static final int AWAIT_SECONDS = 5;

	@Test
	void runsTheSendOffTheCallersThread() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher();
		AtomicReference<String> sendThread = new AtomicReference<>();
		CountDownLatch sent = new CountDownLatch(1);

		try {
			dispatcher.dispatch(() -> {
				sendThread.set(Thread.currentThread().getName());
				sent.countDown();
			});

			assertThat(sent.await(AWAIT_SECONDS, TimeUnit.SECONDS)).as("the dispatched send never ran").isTrue();
			assertThat(sendThread.get())
					.as("the send must run on the dedicated recovery-mail pool, not the caller's thread")
					.isNotEqualTo(Thread.currentThread().getName())
					.startsWith("recovery-mail-");
		}
		finally {
			dispatcher.destroy();
		}
	}

	@Test
	void aRejectedDispatchIsDroppedWithoutThrowing() {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher();
		dispatcher.destroy(); // the executor can no longer accept work
		AtomicBoolean ran = new AtomicBoolean();

		assertThatCode(() -> dispatcher.dispatch(() -> ran.set(true))).doesNotThrowAnyException();

		assertThat(ran).as("a rejected task must not run — least of all on the caller's thread").isFalse();
	}

	@Test
	void carriesTheCallersLoggingContext() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher();
		AtomicReference<String> seen = new AtomicReference<>();
		CountDownLatch sent = new CountDownLatch(1);
		MDC.put(CORRELATION_KEY, "corr-1");

		try {
			dispatcher.dispatch(() -> {
				seen.set(MDC.get(CORRELATION_KEY));
				sent.countDown();
			});

			assertThat(sent.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
			assertThat(seen.get()).as("a failed send must stay traceable to its request").isEqualTo("corr-1");
		}
		finally {
			MDC.clear();
			dispatcher.destroy();
		}
	}

	@Test
	void clearsTheLoggingContextAfterTheTask() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher();
		AtomicReference<String> leaked = new AtomicReference<>("never ran");
		CountDownLatch first = new CountDownLatch(1);
		CountDownLatch second = new CountDownLatch(1);

		try {
			MDC.put(CORRELATION_KEY, "corr-1");
			dispatcher.dispatch(first::countDown);
			MDC.clear();
			assertThat(first.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();

			dispatcher.dispatch(() -> {
				leaked.set(MDC.get(CORRELATION_KEY));
				second.countDown();
			});

			assertThat(second.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
			assertThat(leaked.get()).as("the previous task's context leaked onto the pooled thread").isNull();
		}
		finally {
			MDC.clear();
			dispatcher.destroy();
		}
	}
}
