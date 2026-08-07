package ai.riviera.platform.shared;

import java.util.Map;

import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

/**
 * Carries the submitting thread's SLF4J {@link MDC} onto a pooled worker, and restores the running
 * thread's own afterwards so a context cannot leak onto the next task sharing that thread. Invariant #7
 * keeps the recipient and the booking code out of these workers' log lines, which leaves the
 * correlation id as the only handle on <em>which</em> unit of work they describe.
 *
 * <p>Three traps, all of them load-bearing:
 *
 * <ul>
 * <li><strong>{@link #decorate} must run on the submitting thread</strong>, and does — Spring's
 * {@code ThreadPoolTaskExecutor} decorates inside {@code execute}/{@code submit}, before the task is
 * queued. Capturing inside the returned {@link Runnable} would read the <em>worker's</em> own empty
 * context, and still keep every naive propagation test green whenever submitter and worker happen to
 * be the same thread.</li>
 * <li><strong>A pool whose decorator slot is already taken must compose, not replace</strong> — use
 * {@code CompositeTaskDecorator}. Calling {@code setTaskDecorator} twice silently discards the first,
 * and the lines that stop being emitted are not what any test asserts.
 * {@code WorkerContextArchitectureTest} pins that every self-configured pool carries this class.</li>
 * <li><strong>Rejection lines need no decorator — do not "fix" them here.</strong>
 * {@code ThreadPoolExecutor.execute} calls {@code reject(...)} on the <strong>calling</strong> thread,
 * which for an {@code AFTER_COMMIT} listener is the thread committing the transaction, so they already
 * carry the filter's context.</li>
 * </ul>
 *
 * <p>Stateless, so an instance per pool is as good as a shared one. Why this belongs in the shared
 * kernel rather than a module: {@code RESPONSIBILITIES.md} §{@code shared}.
 */
public final class MdcTaskDecorator implements TaskDecorator {

	@Override
	public Runnable decorate(Runnable task) {
		return new ContextCarryingTask(task, MDC.getCopyOfContextMap());
	}

	/**
	 * The task {@code decorated} carries, or {@code decorated} itself when this decorator did not produce
	 * it. The caller's <strong>context stays private</strong> — only the payload comes back out, so it
	 * remains readable solely through {@link #inContextOf}.
	 *
	 * <p>Exists because the pool applies decoration inside {@code execute}, so what sits on the queue is
	 * never the object the submitter handed over — and the recovery dispatcher's shutdown accounting must
	 * look past this wrapper to name the flow a discarded send belonged to.
	 */
	public static Runnable payloadOf(Runnable decorated) {
		return decorated instanceof ContextCarryingTask carried ? carried.task() : decorated;
	}

	/**
	 * Run {@code action} under the logging context {@code task} was submitted with, restoring the running
	 * thread's own afterwards. A task this decorator did not produce carries none, so the action runs as
	 * it would have anyway — accounting for a loss must never depend on it.
	 */
	public static void inContextOf(Runnable task, Runnable action) {
		if (task instanceof ContextCarryingTask carried) {
			carried.inCallerContext(action);
			return;
		}
		action.run();
	}

	/**
	 * A submitted task paired with its submitter's logging context. Private: reachable only through
	 * {@link #inContextOf}, so no caller can read it out and log it somewhere unbounded.
	 *
	 * <p>The context is <strong>restored</strong> rather than cleared afterwards. On a pooled worker the
	 * two are the same; the difference exists for the one caller that is not a worker — the shutdown
	 * thread, whose own context must survive the lines it emits for other people's mail.
	 */
	private record ContextCarryingTask(Runnable task, Map<String, String> callerContext) implements Runnable {

		@Override
		public void run() {
			inCallerContext(task);
		}

		private void inCallerContext(Runnable action) {
			Map<String, String> ownContext = MDC.getCopyOfContextMap();
			if (callerContext != null) {
				MDC.setContextMap(callerContext);
			}
			try {
				action.run();
			}
			finally {
				restore(ownContext);
			}
		}

		private static void restore(Map<String, String> context) {
			if (context == null) {
				MDC.clear();
				return;
			}
			MDC.setContextMap(context);
		}
	}
}
