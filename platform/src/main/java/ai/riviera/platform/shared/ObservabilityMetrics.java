package ai.riviera.platform.shared;

/**
 * The names of the platform's operational metrics — the single source of truth shared by the
 * emitters and by whatever reads them. The {@code String} constants are inlined at compile time, so
 * referencing one creates no runtime dependency on this class (invariant #11).
 *
 * <p>The remit is metric <em>names</em>; the emitter owns the emission and its tag vocabularies.
 * <strong>Never sum two counters here</strong> — each names a distinct loss mode with a distinct
 * remedy. What each one means, its tags, and when to alert: {@code docs/runbooks/observability.md}.
 * Why the names live in the shared kernel at all: {@code RESPONSIBILITIES.md} §{@code shared}.
 */
public final class ObservabilityMetrics {

	/** Gauge: incomplete Spring Modulith event publications (outbox backlog) — money-path signal 1 of 3. */
	public static final String OUTBOX_PENDING = "riviera.outbox.pending";

	/**
	 * Counter: refunds the platform owes that did not reach the guest — money-path signal 2 of 3.
	 * Counts a refund the gateway refused to issue and one it accepted then reported dead alike; the
	 * runbook splits the shapes, because they need different responses.
	 */
	public static final String REFUNDS_FAILED = "riviera.refunds.failed";

	/**
	 * Gauge: bookings whose refund the gateway would not issue and which are still owed the money.
	 * Distinct refunds owed, where {@link #REFUNDS_FAILED} counts observations — one stuck refund
	 * re-increments that counter on every resubmission but moves this gauge by one. Never sum the
	 * two; read the counter for "something happened" and the gauge for "how many are outstanding".
	 * It falls back as bookings are settled, so it is the one that should return to zero.
	 */
	public static final String REFUNDS_OWED = "riviera.refunds.owed";

	/** Standard Boot Web timer; a webhook 5xx is a tag slice of it — money-path signal 3 of 3. */
	public static final String HTTP_SERVER_REQUESTS = "http.server.requests";

	/**
	 * Counter: cancellation refunds shed because the refund bulkhead's pool was saturated. Distinct
	 * from {@link #REFUNDS_FAILED} — shed is a refund the gateway was never asked for, and unlike a
	 * failure it does not leave the process. Deferred, not lost: the event publication stays
	 * outstanding.
	 */
	public static final String REFUNDS_SHED = "riviera.refunds.shed";

	/**
	 * Counter: refunds already present at the gateway and adopted instead of created again. An
	 * increment means an earlier attempt moved the money but lost the response, so nothing was
	 * recorded locally — the money is right and the record has just caught up. Distinct from
	 * {@link #REFUNDS_FAILED}: nothing failed here. Chase a rising rate as a gateway-connectivity
	 * signal, not a money one.
	 */
	public static final String REFUNDS_ADOPTED = "riviera.refunds.adopted";

	/**
	 * Counter: registry-borne mails shed because the bulkhead pool was saturated. The only member of
	 * the mail-loss family expected to be re-delivered — its event publication stays outstanding.
	 */
	public static final String MAIL_REGISTRY_SHED = "riviera.mail.registry.shed";

	/**
	 * Counter: mails the bounded in-memory dispatcher never ran, and so never sent. Tags:
	 * {@code kind} (which flow), {@code reason} (saturated / shutdown / abandoned). "Recovery" names
	 * the vehicle, not the flow — it also carries the operator-approval notice. Nothing retries these:
	 * the payload is a single-use bearer credential the registry may not persist (ADR-0011).
	 */
	public static final String MAIL_RECOVERY_DROPPED = "riviera.mail.recovery.dropped";

	/**
	 * Counter: recovery mails the dispatcher accepted and then failed to deliver. The line against
	 * {@link #MAIL_RECOVERY_DROPPED} is attempted versus never attempted. Tags: {@code kind},
	 * {@code reason} (transport / suppression-lookup — a relay fault and a database fault, which page
	 * different systems). Read this one first during a suspected relay outage.
	 */
	public static final String MAIL_RECOVERY_FAILED = "riviera.mail.recovery.failed";

	/**
	 * Counter: booking-confirmation mails the registry listener gave up on because a fact it needs did
	 * not resolve. Tags: {@code reason} (no-booking / no-set / no-contact, naming the module to
	 * investigate). Read an increment as a data-integrity fault, never a relay fault. Invisible to
	 * {@link #OUTBOX_PENDING} by design — the listener returns normally, so the publication completes.
	 */
	public static final String MAIL_CONFIRMATION_ABANDONED = "riviera.mail.confirmation.abandoned";

	/**
	 * Counter: cancellation/refund record mails the registry listener gave up on. Same vehicle and
	 * {@code reason} vocabulary as {@link #MAIL_CONFIRMATION_ABANDONED}; the money is unaffected, only
	 * the written record of it. A sibling series rather than a tag because this name states a flow.
	 */
	public static final String MAIL_CANCELLATION_ABANDONED = "riviera.mail.cancellation.abandoned";

	/**
	 * Counter: payment-due mails the registry listener gave up on. The sharpest of the abandoned
	 * series — this is the guest's only notice that an accepted request must be paid for, and by when,
	 * so an increment predicts a set released at the deadline. Chase it before that deadline passes.
	 */
	public static final String MAIL_PAYMENT_DUE_ABANDONED = "riviera.mail.payment-due.abandoned";

	/**
	 * Counter: request-declined record mails the registry listener gave up on. Retrospective, unlike
	 * {@link #MAIL_PAYMENT_DUE_ABANDONED}: the guest waits on a request already refused, but nothing
	 * further is forfeited on a clock.
	 */
	public static final String MAIL_REQUEST_DECLINED_ABANDONED = "riviera.mail.request-declined.abandoned";

	/**
	 * Counter: request-expired record mails the registry listener gave up on — the mirror of
	 * {@link #MAIL_REQUEST_DECLINED_ABANDONED} for the sweep's outcome. A declined guest was answered
	 * and not told; an expired one was never answered at all.
	 */
	public static final String MAIL_REQUEST_EXPIRED_ABANDONED = "riviera.mail.request-expired.abandoned";

	private ObservabilityMetrics() {
	}
}
