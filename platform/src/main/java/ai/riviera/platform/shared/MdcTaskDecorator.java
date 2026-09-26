package ai.riviera.platform.shared;

import java.util.Map;

import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

/**
 * Carries the submitter's {@link MDC} onto a pooled worker, then restores the worker's own so no
 * context leaks onto the next task (invariant #7 keeps booking codes and recipients out; the
 * correlation id is the handle). {@link #decorate} must capture on the submitting thread, not in
 * the task. A taken decorator slot composes via {@code CompositeTaskDecorator}; a second
 * {@code setTaskDecorator} silently drops the first. Rejections log on the calling thread, already
 * in context: don't "fix" them. Why {@code shared}: {@code RESPONSIBILITIES.md} §{@code shared}.
 */
public final class MdcTaskDecorator implements TaskDecorator {

	@Override
	public Runnable decorate(Runnable task) {
		return new ContextCarryingTask(task, MDC.getCopyOfContextMap());
	}

	/**
	 * The task {@code decorated} wraps, or {@code decorated} itself if this decorator didn't produce it;
	 * what the queue holds is never the submitter's object. The <strong>context stays private</strong>,
	 * readable solely through {@link #inContextOf}.
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
