package ai.riviera.platform.shared;

/**
 * The names of the platform's operational metrics — the single source of truth shared by the
 * emitters and by whatever reads them. A public {@code shared}-kernel vocabulary (like
 * {@link ApiProblem}) so a module emitter can reference a name without reaching into another module;
 * the {@code String} constants are inlined at compile time, so referencing one creates no runtime
 * dependency on this class (invariant #11).
 *
 * <p><strong>The remit is metric <em>names</em>, not the money path.</strong> It began (issue #100,
 * D4) holding only the three money-path signals, and #408 widened it deliberately rather than let a
 * second convention grow: the alternative — each module declaring its own names locally — would give
 * the codebase two answers to "where is a metric name written down" and no way to check one against
 * the other. Membership costs nothing (a constant, inlined) and the emitter still owns the emission;
 * only the name lives here. The money-path trio stays grouped and labelled below, because
 * {@code MoneyPathAlertCheck} reads exactly those three and nothing else.
 */
public final class ObservabilityMetrics {

	/** Gauge: incomplete Spring Modulith event publications (outbox backlog) — money-path signal 1 of 3. */
	public static final String OUTBOX_PENDING = "riviera.outbox.pending";

	/** Counter: refunds the gateway failed to issue — money-path signal 2 of 3. */
	public static final String REFUNDS_FAILED = "riviera.refunds.failed";

	/** Standard Boot Web timer; a webhook 5xx is a tag slice of it — money-path signal 3 of 3. */
	public static final String HTTP_SERVER_REQUESTS = "http.server.requests";

	/**
	 * Counter: registry-borne mails shed because the bulkhead pool was saturated (#408). Not a
	 * money-path signal — {@code MoneyPathAlertCheck} deliberately does not read it — but the shed
	 * path's only attributable, alertable trace: each increment is a confirmation mail that never
	 * reached the relay and now waits on the Event Publication Registry's republish. The recovery
	 * vehicle's drop is a different event with a different meaning (nothing to retry from), so it has
	 * its own name — {@link #MAIL_RECOVERY_DROPPED} (#415); do not sum the two.
	 */
	public static final String MAIL_REGISTRY_SHED = "riviera.mail.registry.shed";

	/**
	 * Counter: recovery mails (email verification, password reset) the bounded in-memory dispatcher
	 * could not accept and therefore dropped (#415). The sibling {@link #MAIL_REGISTRY_SHED} reserved
	 * this name and declined to declare it, on the rule that a name ships with the emitter that gives
	 * it meaning.
	 *
	 * <p><strong>It measures a strictly worse event than the shed does.</strong> A shed registry mail
	 * is deferred — its event publication stays outstanding and a restart republishes it. A dropped
	 * recovery mail is <em>gone</em>: the payload is a single-use bearer credential the registry may
	 * not persist (ADR-0011 decision 5), so nothing retries it and the user recovers only by
	 * re-requesting. Read an increment as exactly that: one person who asked for a reset or
	 * verification link and will wait for a mail that is never coming.
	 *
	 * <p>Carries a {@code reason} tag distinguishing a saturated pool (a degraded relay — act) from a
	 * shutdown race (a redeploy outran an in-flight request — expected in ones and twos). Both are
	 * real losses, so both are counted; the tag is what keeps a deploy from reading as an outage. The
	 * emitter owns the tag's vocabulary — see {@code AsyncMailDispatcher} and the observability
	 * runbook.
	 */
	public static final String MAIL_RECOVERY_DROPPED = "riviera.mail.recovery.dropped";

	private ObservabilityMetrics() {
	}
}
