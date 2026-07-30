package ai.riviera.platform.notification.application;

import java.util.Map;

import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

/**
 * Carries the submitting thread's SLF4J {@link MDC} onto a mail worker, and clears it afterwards so it
 * cannot leak onto the next task sharing the pooled thread (#410).
 *
 * <p><strong>The module's one MDC mechanism, deliberately.</strong> {@link AsyncMailDispatcher} carried
 * the context by hand from #369; the registry vehicle's pool
 * ({@code RegistryMailExecutorConfig}) carried nothing, so every line a registry-mail <em>worker</em>
 * emitted was unattributable — {@code BookingConfirmationMailListener}'s abandoned-confirmation
 * {@code ERROR} (#428), {@code TransactionalMailService}'s suppression {@code WARN}, and whatever #370's
 * real relay produces on a transport failure. Invariant #7 keeps the recipient and the arrival code out
 * of those lines, which leaves the correlation id as the only handle on <em>which</em> send they
 * describe: without it you know a mail was lost, not whose. A {@link TaskDecorator} is the framework's
 * own seam for this, so both vehicles share it rather than diverging into two implementations of one
 * rule.
 *
 * <p><strong>What this does not fix, because it was never broken.</strong> The rejection lines — the
 * registry pool's shed {@code ERROR} and both pools' shutdown notices — run on the thread that called
 * {@code execute}, which in production is the thread committing the booking transaction (an
 * {@code AFTER_COMMIT} listener is dispatched from inside {@code commit()}) and therefore already
 * carries {@code CorrelationIdFilter}'s context. They are attributable for that reason, not this one,
 * and {@code RegistryMailExecutorConfigTest#theShedLineIsAttributableToTheSubmittingRequest} pins the
 * property rather than leaving the comment to assert it.
 *
 * <p><strong>{@link #decorate} must run on the submitting thread</strong> — and does: Spring's
 * {@code ThreadPoolTaskExecutor} decorates inside {@code execute}/{@code submit}, before the task
 * reaches the queue. Capturing inside the returned {@link Runnable} instead would read the
 * <em>worker's</em> own (empty) context, which is a change that keeps every naive propagation test green
 * whenever submitter and worker happen to be the same thread.
 *
 * <p><strong>The decorated task is a named type, not a lambda</strong> (#434), because one caller needs
 * the captured context <em>without</em> running the task: {@link AsyncMailDispatcher}, accounting on the
 * closing thread for the sends it is discarding at shutdown. Those lines are emitted where no request
 * context exists, so {@link #inContextOf} lends them the one the abandoned send still carries — otherwise
 * the per-loss rule they follow would produce identical lines that name nobody.
 *
 * <p>Public because both vehicles use it from different packages and {@code adapter/in → application}
 * is the permitted direction (invariant #11). Stateless, so an instance per pool is as good as a shared
 * one. A pool that already has a decorator must <strong>compose</strong> rather than replace — see
 * {@code RegistryMailExecutorConfig}, whose saturation policy owns the same slot.
 */
public final class MdcTaskDecorator implements TaskDecorator {

	@Override
	public Runnable decorate(Runnable task) {
		return new ContextCarryingTask(task, MDC.getCopyOfContextMap());
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
