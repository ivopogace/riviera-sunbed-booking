package ai.riviera.platform.notification.application;

import java.util.ArrayList;
import java.util.List;

import ai.riviera.platform.shared.ObservabilityMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * <p><strong>That rule is the module's, not this class's</strong> (#383). It was stated here and then
 * broken next door: #371's registry-borne booking confirmation went onto the shared executor, because
 * {@code @ApplicationModuleListener} accepts no executor qualifier — and with a per-confirmed-booking
 * volume this pool never had. The registry vehicle now has its own bounded sibling,
 * {@code RegistryMailExecutorConfig}, and {@code MailListenerExecutorArchitectureTest} fails the build
 * if a future mail listener forgets it. The two pools stay separate, with deliberately different
 * saturation behaviour: this one <em>drops</em>, because a recovery payload is a bearer credential the
 * Event Publication Registry may not persist (ADR-0011 decision 5) so there is nothing to retry from;
 * the registry one <em>sheds</em>, because its publication survives and is republished on restart.
 *
 * <p>The caller's logging context rides along so a failed send stays traceable to its request (the
 * correlation id from {@code CorrelationIdFilter}), and is cleared afterwards so it cannot leak onto the
 * next task sharing the pooled thread. <strong>Since #410 that is {@link MdcTaskDecorator}'s job, not
 * this class's</strong> — the hand-rolled capture/restore here was the only implementation of a rule the
 * registry vehicle's pool needed too, and two implementations of one rule is how one of them ends up
 * missing (it had been, for the whole of #383). Package-private (RV-BE-11); pinned by
 * {@code AsyncMailDispatcherTest}.
 *
 * <p><strong>One drainer thread, deliberately</strong> — recovery mail is a handful of sends a day, and a
 * serial drain behind a 100-deep buffer is the whole requirement. Core and max are equal on purpose: a
 * {@code ThreadPoolExecutor} grows past its core size only once the queue is <em>full</em>, so a larger max
 * with this queue would add no headroom until 100 sends were already backed up — an inviting number to
 * "tune" and a misleading one to read.
 *
 * <p><strong>Everything that runs on this thread must be bounded</strong>, because one serial drainer
 * means one wedged task stalls the queue and then silently drops sends once the 100 slots fill. Two
 * things run here, not one: the SMTP round-trip, whose connect/read/write timeouts are finite (#368),
 * and — since the {@code notification} module gained the suppression list (#382) — a database read.
 * That read arrived after this class was written and inherited Postgres's infinite default statement
 * timeout; {@code JdbcEmailSuppressions} now gives it a finite {@code queryTimeout} of its own (#386),
 * deliberately scoped to that one lookup rather than set globally, where it would also bound
 * {@code availability}'s {@code SELECT … FOR UPDATE} (invariant #2).
 *
 * <p><strong>Every drop is counted, and every drop is logged — one line each, deliberately</strong> (#415).
 * The counter ({@link ObservabilityMetrics#MAIL_RECOVERY_DROPPED}) is the alertable signal; before it, "how
 * often did the recovery vehicle drop?" was answerable only by grepping logs.
 *
 * <p>The per-line half is where this class parts company with {@code RegistryMailExecutorConfig}, which
 * throttles to one escalated line per saturation episode — and the divergence is deliberate on both sides.
 * <strong>A throttle trades repeated lines for the durable record that makes them redundant.</strong> The
 * registry vehicle has that record: a shed send's event publication is still outstanding, payload and all,
 * so the ninth line tells an operator nothing the row does not. This vehicle has none, by construction —
 * ADR-0011 decision 5 keeps the bearer-credential payload out of the registry — so there is nothing to retry
 * from and <em>the line is the only per-loss artefact that exists</em>, carrying in its MDC the correlation
 * id of the request whose user is still waiting. Throttling here would discard evidence, not noise. The
 * flood the registry's throttle exists to prevent has no analogue either: that flood is a restart
 * republishing a backlog, and this vehicle never republishes, so arrivals are live requests only. All three
 * endpoints that feed it — customer register, the authenticated verification resend, and forgot-password —
 * are bounded by a <em>per-IP</em> token budget in {@code RateLimitFilter} (D-8), though not the same one:
 * register rides {@code customerAuthBuckets} while the other two ride the recovery budget, a separation
 * that is deliberate (recovery spam must not starve login) and does not weaken the bound. Should aggregate
 * volume ever make these lines a genuine flood, add an escalated once-per-episode line <em>beside</em> the
 * per-drop record, never in place of it.
 *
 * <p><strong>A rejection during shutdown is still a loss, so it is still counted</strong> — the second
 * divergence. #408 excludes the registry's equivalent because a shed-at-shutdown send loses nothing; here,
 * with {@code server.shutdown=graceful} unset, an in-flight request can reach {@code dispatch} after the pool
 * has stopped accepting, and that user's mail is simply gone. Excluding it would make the counter
 * under-report the very thing the runbook says it means. The {@code reason} tag carries the distinction
 * instead, so a routine redeploy cannot read as a degraded relay: only {@link #REASON_SATURATED} escalates
 * to {@code ERROR} and warrants investigating the relay.
 *
 * <p><strong>A redeploy loses mail two ways, and both are this counter's</strong> (#434). The rejection
 * above is the send that arrived too late; {@link #REASON_ABANDONED} — see {@link #accountForAbandonedSends()}
 * — is the send that arrived in time and was still queued when the drain window expired. They differ only in
 * whether {@code execute} had already returned, which is invisible to the user and irrelevant to the remedy,
 * so they are two reasons on one series rather than two series. That also keeps the taxonomy consistent with
 * #423's split, which is not refusal-versus-acceptance but <em>attempted versus never attempted</em>:
 * {@link ObservabilityMetrics#MAIL_RECOVERY_FAILED} is the send the transport ran and lost, and every reason
 * here is a send this pool never ran. Read {@link ObservabilityMetrics#MAIL_RECOVERY_DROPPED} as
 * "never ran", then, never as "refused".
 *
 * <p><strong>The shutdown drain is derived from the relay budget, and expiring it means giving up</strong>
 * (#410). The window is {@link MailTransportBudget#shutdownDrain()} rather than the 5-second literal #369
 * shipped, which was smaller than the budget one degraded send can legitimately occupy — so a redeploy
 * mid-backlog abandoned work that was still running and closed the data source underneath it. When the
 * window expires this class does <em>not</em> escalate to {@code shutdownNow()}: an interrupt cannot tell
 * a send that already handed the message to the relay from one that has not, and interrupting the first is
 * how at-least-once becomes a duplicate. The cost lands differently here than for the registry vehicle,
 * though, and that asymmetry is the same one as everywhere else in this class — an abandoned recovery send
 * has no publication to be republished from, so it is simply a mail the user must re-request. Which is why
 * #434 made it visible: the registry's equivalent shows up in {@code riviera.outbox.pending}, and this one
 * showed up nowhere until {@link #accountForAbandonedSends()} counted it.
 *
 * <p><strong>The cause is read after the rejection, and that race is one-directional by construction.</strong>
 * {@code execute} throws before {@link #recordDrop} can ask why, so a saturation rejection coinciding with a
 * concurrent {@code destroy()} is attributed to the shutdown. The converse cannot happen: {@code shutdown()}
 * latches its flag permanently, so a shutdown rejection always reads as one. The error is therefore always
 * <em>under</em>-reporting saturation during the seconds a pod is going away, never the false alarm #408's
 * F-5 was about — a deploy cannot manufacture a {@link #REASON_SATURATED} increment. Do not "fix" this by
 * reading the flag before {@code execute}: that costs a read on every send and is equally racy, since no JDK
 * primitive makes reject-and-classify atomic.
 */
@Component
class AsyncMailDispatcher implements MailDispatcher, DisposableBean {

	private static final Logger log = LoggerFactory.getLogger(AsyncMailDispatcher.class);

	private static final int POOL_SIZE = 1;

	/** Package-private so the spec can fill the queue exactly rather than hard-code a number that drifts. */
	static final int QUEUE_CAPACITY = 100;

	private static final String THREAD_NAME_PREFIX = "recovery-mail-";

	/** The drop's cause, as a metric tag — one series, two operationally different meanings. */
	static final String REASON_TAG = "reason";

	/** The pool was full: the relay is degraded or too slow for current volume. Investigate. */
	static final String REASON_SATURATED = "saturated";

	/** A redeploy outran an in-flight request. Still a lost mail, but no relay is at fault. */
	static final String REASON_SHUTDOWN = "shutdown";

	/** A redeploy outran the queue: accepted, never started, discarded when the drain window expired. */
	static final String REASON_ABANDONED = "abandoned";

	private final ThreadPoolTaskExecutor executor;
	private final Counter droppedWhenSaturated;
	private final Counter droppedWhenShuttingDown;
	private final Counter droppedWhenAbandoned;

	AsyncMailDispatcher(MeterRegistry meters, MailTransportBudget budget) {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(POOL_SIZE);
		pool.setMaxPoolSize(POOL_SIZE);
		pool.setQueueCapacity(QUEUE_CAPACITY);
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setTaskDecorator(new MdcTaskDecorator());
		// A redeploy must not silently swallow a reset link a user is already waiting for.
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationMillis(budget.shutdownDrain().toMillis());
		pool.initialize();
		this.executor = pool;
		this.droppedWhenSaturated = meters.counter(ObservabilityMetrics.MAIL_RECOVERY_DROPPED, REASON_TAG,
				REASON_SATURATED);
		this.droppedWhenShuttingDown = meters.counter(ObservabilityMetrics.MAIL_RECOVERY_DROPPED, REASON_TAG,
				REASON_SHUTDOWN);
		this.droppedWhenAbandoned = meters.counter(ObservabilityMetrics.MAIL_RECOVERY_DROPPED, REASON_TAG,
				REASON_ABANDONED);
	}

	@Override
	public void dispatch(Runnable send) {
		try {
			executor.execute(send);
		}
		catch (TaskRejectedException e) {
			recordDrop(e);
		}
	}

	/**
	 * Account for a send that will never be delivered. Nothing here may throw or run the task: this runs on
	 * the caller's request thread, whose response the send may not influence (D-8). Neither line carries the
	 * address or the link (invariant #7); the correlation id rides the MDC.
	 */
	private void recordDrop(TaskRejectedException cause) {
		if (executor.getThreadPoolExecutor().isShutdown()) {
			droppedWhenShuttingDown.increment();
			log.warn("Recovery email dispatch rejected during shutdown ({}); the send was dropped and the user "
					+ "must re-request", cause.getClass().getSimpleName());
			return;
		}
		droppedWhenSaturated.increment();
		log.error("Recovery email dispatcher saturated ({}); the send was dropped with nothing to retry from, so "
				+ "the user must re-request", cause.getClass().getSimpleName());
	}

	@Override
	public void destroy() {
		executor.shutdown();
		accountForAbandonedSends();
	}

	/**
	 * Account for every send the drain window did not reach (#434). {@code shutdown()} above has already
	 * awaited that window and given up, so anything still queued is a mail nobody will ever send and
	 * nothing else will ever see: {@code execute} returned normally (neither rejection reason fires), the
	 * task never ran ({@link ObservabilityMetrics#MAIL_RECOVERY_FAILED} cannot), and this vehicle keeps no
	 * durable copy, so {@code riviera.outbox.pending} has nothing to carry either.
	 *
	 * <p><strong>Draining is what makes the count true, and it is not an interrupt.</strong> The pool is
	 * still <em>running</em> here — awaiting termination timed out, it did not stop the threads — so a send
	 * merely counted and left in place could still execute, and the counter would then report a loss that
	 * did not happen. {@code drainTo} makes the count and the loss the same event while touching only the
	 * queue, which is exactly the part {@code shutdownNow()} would have returned anyway; the decision not
	 * to call it (#410, above) is untouched. Racing the drainer for an element is harmless in both
	 * directions: a {@code BlockingQueue} hands each task to exactly one of {@code poll} and
	 * {@code drainTo}, so it is run <em>xor</em> counted, never both and never neither.
	 *
	 * <p><strong>The send caught <em>running</em> is deliberately not counted.</strong> It may already have
	 * handed the message to the relay — the ambiguity that made give-up the right call — so charging it
	 * here would over-report a mail that arrived. The runbook states that exclusion rather than leaving the
	 * series to read as "every mail lost at shutdown".
	 */
	private void accountForAbandonedSends() {
		List<Runnable> abandoned = new ArrayList<>();
		executor.getThreadPoolExecutor().getQueue().drainTo(abandoned);
		abandoned.forEach(this::recordAbandonment);
	}

	/**
	 * One line per loss, under the abandoned send's <em>own</em> context: this runs on the thread closing
	 * the application context, which in production is a shutdown thread with no request of its own to name
	 * (and whatever context it does carry is restored afterwards, not cleared — see {@link MdcTaskDecorator}).
	 * Invariant #7 keeps the address and the link out of the line, so the borrowed correlation id is the
	 * only thing left that says whose mail this was.
	 */
	private void recordAbandonment(Runnable send) {
		droppedWhenAbandoned.increment();
		MdcTaskDecorator.inContextOf(send, AsyncMailDispatcher::logAbandonment);
	}

	private static void logAbandonment() {
		log.warn("Recovery email still queued when the shutdown drain window expired; the send was discarded "
				+ "with the pool and the user must re-request");
	}
}
