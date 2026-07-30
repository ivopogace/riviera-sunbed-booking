package ai.riviera.platform.shared;

import java.util.Map;

import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

/**
 * Carries the submitting thread's SLF4J {@link MDC} onto a pooled worker, and restores the running
 * thread's own afterwards so a context cannot leak onto the next task sharing that thread (#410).
 *
 * <p><strong>Why this lives in the kernel, and it is not "used in more than one place" (#455).</strong>
 * That criterion is explicitly barred by this package's admission test, and this class does not rely on
 * it. The positive argument is <em>ownership</em>: no bounded context owns how a pooled worker inherits
 * the submitting request's logging context. The mechanism's other half — {@code CorrelationIdFilter},
 * which <em>puts</em> the id there — sits at the composition root, and modules must not depend on the
 * root (#371), so a module-owned home is structurally unavailable to any second consumer. That is
 * {@link ShutdownBudget}'s argument shape (#456): admitted because no context owns the platform's
 * SIGTERM grace, not because two of them read it. The class also passes the three-part test outright —
 * no business logic, no module-owned state, and no dependency on a module at all, only on SLF4J's
 * {@code MDC} and Spring's {@link TaskDecorator}.
 *
 * <p><strong>#410 decided the other way, and the ground it gave is now false.</strong> It placed this
 * class in {@code notification.application} reasoning that "both users are inside this one module".
 * #404 then added a third bounded pool in {@code booking} whose worker lines were consequently
 * unattributable, which falsified the premise rather than the reasoning. Recorded here so the next
 * reader sees a decision overturned on its facts, not a contradiction.
 *
 * <p><strong>What this fixes, and what was never broken.</strong> Invariant #7 keeps the recipient and
 * the booking code out of the lines these workers emit, which leaves the correlation id as the only
 * handle on <em>which</em> unit of work they describe: without it you know a mail was lost or a refund
 * logged, not whose. The <em>rejection</em> lines are a different matter and need no decorator —
 * {@code ThreadPoolExecutor.execute} calls {@code reject(...)} on the <strong>calling</strong> thread,
 * which for an {@code AFTER_COMMIT} listener is the thread committing the transaction, so they already
 * carry the filter's context. Do not "fix" them here.
 *
 * <p><strong>{@link #decorate} must run on the submitting thread</strong> — and does: Spring's
 * {@code ThreadPoolTaskExecutor} decorates inside {@code execute}/{@code submit}, before the task
 * reaches the queue. Capturing inside the returned {@link Runnable} instead would read the
 * <em>worker's</em> own (empty) context, which is a change that keeps every naive propagation test green
 * whenever submitter and worker happen to be the same thread.
 *
 * <p><strong>The decorated task is a named type, not a lambda</strong> (#434), because one caller needs
 * the captured context <em>without</em> running the task: the recovery mail dispatcher, accounting on the
 * closing thread for the sends it is discarding at shutdown. Those lines are emitted where no request
 * context exists, so {@link #inContextOf} lends them the one the abandoned send still carries — otherwise
 * the per-loss rule they follow would produce identical lines that name nobody.
 *
 * <p>Stateless, so an instance per pool is as good as a shared one. <strong>A pool whose decorator slot
 * is already taken must compose rather than replace</strong> — {@code CompositeTaskDecorator}, as both
 * saturation-policy pools do; calling {@code setTaskDecorator} twice silently discards the first, and the
 * lines that stop being emitted are not what any test asserts. {@code WorkerContextArchitectureTest}
 * pins that every self-configured pool carries this class, because #404 shipped one that did not and
 * nothing fired.
 */
public final class MdcTaskDecorator implements TaskDecorator {

	@Override
	public Runnable decorate(Runnable task) {
		return new ContextCarryingTask(task, MDC.getCopyOfContextMap());
	}

	/**
	 * The task {@code decorated} carries, or {@code decorated} itself when this decorator did not produce
	 * it. The caller's <strong>context stays private</strong> — only the payload comes back out, so the
	 * "readable solely through {@link #inContextOf}" property this class relies on is untouched.
	 *
	 * <p>Added for the recovery dispatcher's shutdown accounting (#442), which must name the flow a
	 * discarded send belonged to and can only reach it by looking past this wrapper: the pool applies the
	 * decoration inside {@code execute}, so what sits on the queue is never the object the dispatcher
	 * submitted.
	 */
	public static Runnable payloadOf(Runnable decorated) {
		return decorated instanceof ContextCarryingTask carried ? carried.task() : decorated;
	}

	/**
	 * Run {@code action} under the logging context {@code task} was submitted with, restoring the running
	 * thread's own afterwards. A task this decorator did not produce simply carries none, so the action
	 * runs as it would have anyway — accounting for a loss must never depend on it.
	 */
	public static void inContextOf(Runnable task, Runnable action) {
		if (task instanceof ContextCarryingTask carried) {
			carried.inCallerContext(action);
			return;
		}
		action.run();
	}

	/**
	 * A submitted task paired with its submitter's logging context. Private: the context is reachable only
	 * through {@link #inContextOf}, so no caller can read it out and log it somewhere unbounded.
	 *
	 * <p>The context is <strong>restored</strong> rather than cleared afterwards. On a pooled worker the
	 * two are the same — the thread's context is empty when a task starts, because the previous task
	 * restored it — and the difference exists for the one caller that is not a worker: the shutdown thread,
	 * whose own context must survive the lines it emits for other people's mail.
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
