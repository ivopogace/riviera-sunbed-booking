package ai.riviera.platform.shared;

/**
 * The platform's operational metric names, the single source of truth for emitters and readers:
 * dashboards and alerts key on these strings, so renaming one breaks them. The constants inline at
 * compile time, so a reference adds no runtime dependency (invariant #11). Emitters own emission
 * and tags. <strong>Never sum two counters here</strong>: each is a distinct loss mode with its own
 * remedy. Meanings, tags, alerts: {@code docs/runbooks/observability.md}; why {@code shared}:
 * {@code RESPONSIBILITIES.md} §{@code shared}.
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
	 * Gauge: bookings still owed a refund the gateway would not issue — a distinct count that returns
	 * to zero as they settle, where {@link #REFUNDS_FAILED} counts observations (one per resubmission).
	 * Never sum the two.
	 */
	public static final String REFUNDS_OWED = "riviera.refunds.owed";

	/** Standard Boot Web timer; a webhook 5xx is a tag slice of it — money-path signal 3 of 3. */
	public static final String HTTP_SERVER_REQUESTS = "http.server.requests";

	/**
	 * Counter: refund-bulkhead work shed at saturation — a cancellation refund or a remodel-release
	 * void. Unlike {@link #REFUNDS_FAILED}, the gateway was never called. Deferred, not lost: the
	 * event publication stays outstanding.
	 */
	public static final String REFUNDS_SHED = "riviera.refunds.shed";

	/**
	 * Counter: bookings a remodel released as unpaid whose payment had already succeeded, so the void
	 * failed. The guest is owed a refund by hand; nothing retries it. Distinct from
	 * {@link #REFUNDS_FAILED}, which counts refunds the gateway was asked for.
	 */
	public static final String REMODEL_RELEASE_COLLECTED = "riviera.remodel.release.collected";

	/**
	 * Counter: refunds found already at the gateway and adopted, not re-created: an earlier attempt
	 * moved the money but lost the response. Nothing failed (not {@link #REFUNDS_FAILED}); a rising
	 * rate is a gateway-connectivity signal, not a money one.
	 */
	public static final String REFUNDS_ADOPTED = "riviera.refunds.adopted";

	/**
	 * Counter: registry-borne mails shed because the bulkhead pool was saturated. The only member of
	 * the mail-loss family expected to be re-delivered — its event publication stays outstanding.
	 */
	public static final String MAIL_REGISTRY_SHED = "riviera.mail.registry.shed";

	/**
	 * Counter: mails the in-memory dispatcher never ran. Tags {@code kind}, {@code reason} (saturated /
	 * shutdown / abandoned); "recovery" names the vehicle, not the flow. Nothing retries these: the
	 * payload is a single-use bearer credential the registry may not persist (ADR-0011).
	 */
	public static final String MAIL_RECOVERY_DROPPED = "riviera.mail.recovery.dropped";

	/**
	 * Counter: recovery mails accepted, then not delivered: attempted, unlike those in
	 * {@link #MAIL_RECOVERY_DROPPED}. Tags {@code kind}, {@code reason} (transport: a relay fault;
	 * suppression-lookup: a database fault). Read this one first in a suspected relay outage.
	 */
	public static final String MAIL_RECOVERY_FAILED = "riviera.mail.recovery.failed";

	/**
	 * Counter: confirmation mails the registry listener abandoned on an unresolved fact; {@code reason}
	 * (no-booking / no-set / no-contact) names the module to check. A data-integrity fault, never a
	 * relay one; invisible to {@link #OUTBOX_PENDING}, as the publication completes.
	 */
	public static final String MAIL_CONFIRMATION_ABANDONED = "riviera.mail.confirmation.abandoned";

	/**
	 * Counter: cancellation/refund record mails the registry listener gave up on. Same vehicle and
	 * {@code reason} vocabulary as {@link #MAIL_CONFIRMATION_ABANDONED}; the money is unaffected, only
	 * the written record of it. A sibling series rather than a tag because this name states a flow.
	 */
	public static final String MAIL_CANCELLATION_ABANDONED = "riviera.mail.cancellation.abandoned";

	/**
	 * Counter: changed-spot notices the registry listener gave up on. Same vehicle and {@code reason}
	 * vocabulary as {@link #MAIL_CONFIRMATION_ABANDONED}; the booking is moved either way, only the
	 * guest's notice of it — and of their free-exit deadline — is lost, so chase it before that deadline.
	 */
	public static final String MAIL_MOVE_ABANDONED = "riviera.mail.move.abandoned";

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
