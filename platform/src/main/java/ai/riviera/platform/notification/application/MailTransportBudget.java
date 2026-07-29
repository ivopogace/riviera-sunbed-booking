package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * The relay's per-socket-operation budget, and the shutdown drain window <strong>derived</strong> from
 * it (#410 Part 2).
 *
 * <p><strong>Why derived rather than a second constant.</strong> #368 gave the SMTP transport finite
 * connect/read/write timeouts — 10s each — because Jakarta Mail's defaults are infinite, long enough for
 * a degraded relay to pin a sending thread indefinitely. Separately, #369 and #383 gave the two mail
 * pools {@code awaitTerminationSeconds(5)}. Nothing related the two numbers and they disagreed by
 * construction: a single degraded send can legitimately occupy its thread for a full socket timeout, so
 * the drain gave up while legitimate work was still running. {@code ExecutorConfigurationSupport} then
 * awaits the window and simply <em>returns</em> — it does not escalate — so context shutdown proceeds and
 * {@code HikariDataSource} closes underneath threads mid-send. Durability was never at risk (an
 * incomplete publication stays outstanding and is republished next boot, which is what the registry is
 * for), but a Render redeploy during a backlog produced connection-closed noise at the worst possible
 * moment, and a send that had already reached the relay could be duplicated. Reading both from one
 * knob means tuning the relay budget moves the drain, and neither can silently invalidate the other.
 *
 * <p><strong>The derivation is one socket operation, not a whole send.</strong> A worker caught by
 * shutdown is sitting in exactly one blocking socket call, and letting that call reach its own timeout is
 * what lets the send unwind and the thread finish — so one budget is the window that makes the drain
 * coherent. #368's ~30s worst case (connect <em>plus</em> read <em>plus</em> write) describes a relay
 * that is slow but <em>progressing</em> rather than wedged, and draining for that long would be
 * self-defeating: it exceeds the platform's SIGTERM→SIGKILL grace, so the process would be killed
 * mid-shutdown and lose the orderly close entirely — strictly worse than giving up. The ceiling that
 * keeps the derived window inside that grace is validated where the value is bound
 * ({@code MailTransportProperties}).
 *
 * <p><strong>What happens when the window expires: nothing further, deliberately.</strong> This slice
 * does <em>not</em> escalate to {@code shutdownNow()}. Interrupting a send whose publication is still
 * outstanding would be safe, but interrupting one that has already handed the message to the relay is
 * precisely how at-least-once becomes a duplicate — and an interrupt cannot tell the two apart. So an
 * unfinished registry send stays outstanding for the next start's republish, and an unfinished recovery
 * send is a loss the user re-requests (it has no durable copy, ADR-0011 decision 5). Both pools' tests
 * pin the non-interruption, so a future "let's be tidy and call shutdownNow" goes red.
 *
 * <p>A plain application-layer value carrying no configuration type — the
 * {@code CustomerRetentionProperties → RetentionWindow} pattern — so the inner hexagon stays
 * framework-light and both vehicles (one in {@code application}, one in {@code adapter/in}) can read it.
 *
 * @param socketTimeout the per-operation budget every {@code spring.mail.properties.mail.smtp.*} timeout
 *        is set from, and the window each mail pool drains for on shutdown
 */
public record MailTransportBudget(Duration socketTimeout) {

	public MailTransportBudget {
		if (socketTimeout == null || socketTimeout.isZero() || socketTimeout.isNegative()) {
			throw new IllegalArgumentException(
					"socketTimeout must be a positive duration, but was " + socketTimeout
							+ "; it is both the relay's per-operation budget and the pools' shutdown drain "
							+ "window, so a non-positive value would drain for no time at all");
		}
	}

	/**
	 * How long a pool waits for sends already on a thread before giving up — one socket operation's
	 * budget, for the reasons in this record's Javadoc.
	 */
	public Duration shutdownDrain() {
		return socketTimeout;
	}
}
