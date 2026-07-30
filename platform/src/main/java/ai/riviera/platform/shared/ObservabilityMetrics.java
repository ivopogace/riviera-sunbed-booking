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
	 * its own name — {@link #MAIL_RECOVERY_DROPPED} (#415). Each later mail loss earned a name of its
	 * own for the same reason ({@link #MAIL_RECOVERY_FAILED} #423, {@link #MAIL_CONFIRMATION_ABANDONED}
	 * #428): <strong>do not sum them.</strong> This one is the only member of the set that is expected
	 * to be re-delivered, which is precisely why summing would mislead.
	 */
	public static final String MAIL_REGISTRY_SHED = "riviera.mail.registry.shed";

	/**
	 * Counter: mails the bounded in-memory dispatcher <strong>never ran</strong>, and therefore never
	 * sent (#415, widened by #434). <strong>"Recovery" in this name is the vehicle, not the flow</strong>
	 * — it was coined when that dispatcher carried only email verification and password reset; since
	 * #375 it also carries the operator-approval notice, which is no recovery flow at all. The name
	 * stays because renaming a shipped metric breaks whatever reads it, so the {@code kind} tag is what
	 * separates the flows. The sibling
	 * {@link #MAIL_REGISTRY_SHED} reserved this name and declined to declare it, on the rule that a name
	 * ships with the emitter that gives it meaning.
	 *
	 * <p><strong>It measures a strictly worse event than the shed does.</strong> A shed registry mail
	 * is deferred — its event publication stays outstanding and a restart republishes it. A dropped
	 * recovery mail is <em>gone</em>: the payload is a single-use bearer credential the registry may
	 * not persist (ADR-0011 decision 5), so nothing retries it. Read an increment as one person who
	 * will wait for a mail that is never coming — and read the {@code kind} tag to learn whether they
	 * can do anything about it. A {@code verification} or {@code password-reset} loss self-heals when
	 * they ask again; an {@code operator-approved} loss (#375) does not, because nothing re-sends it
	 * and they were never told to expect it (amended #439, as on {@link #MAIL_RECOVERY_FAILED}).
	 *
	 * <p>Carries a {@code reason} tag distinguishing a saturated pool (a degraded relay — act) from the
	 * two ways a redeploy loses a mail: the request that reached a closed pool ({@code shutdown}), and
	 * the send that was accepted but still queued when the drain window expired ({@code abandoned},
	 * #434). All three are real losses, so all three are counted; the tag is what keeps a deploy from
	 * reading as an outage.
	 *
	 * <p><strong>"Never ran" is the line between this counter and {@link #MAIL_RECOVERY_FAILED}, not
	 * "refused"</strong> — {@code abandoned} was accepted and still belongs here, because the split
	 * #423 drew is <em>attempted versus never attempted</em>. One loss at shutdown is deliberately in
	 * neither: the send caught <em>running</em> when the window expires may already have reached the
	 * relay, so counting it would over-report a mail that arrived. The emitter owns the tag's
	 * vocabulary and that exclusion — see {@code AsyncMailDispatcher} and the observability runbook.
	 */
	public static final String MAIL_RECOVERY_DROPPED = "riviera.mail.recovery.dropped";

	/**
	 * Counter: recovery mails the dispatcher <em>accepted</em> and then failed to deliver (#423) — the
	 * third silent loss site, and the one that fires first in a real outage. Its sibling
	 * {@link #MAIL_RECOVERY_DROPPED} covers the mail the dispatcher <em>never ran</em> — refused at
	 * submit, or accepted and discarded unrun at shutdown (#434); the user cannot
	 * tell the two apart (they asked for a link, got a {@code 200}, and nothing is coming), but an
	 * operator very much can, and only one of them was alertable before this name existed.
	 *
	 * <p><strong>Read this one first during a suspected relay outage.</strong> Saturating the recovery
	 * dispatcher takes 100 sends queued behind a wedged drainer at a volume of a handful a day, so
	 * {@code MAIL_RECOVERY_DROPPED} is rare by construction; a relay that is simply down fails
	 * <em>every</em> send and raises this one immediately. Do not sum the four mail counters — they
	 * measure a deferral, a send the pool never ran, an attempt that failed, and a confirmation given
	 * up on, respectively. ("Never ran" rather than "refused" since #434 widened the first of those —
	 * see {@link #MAIL_RECOVERY_DROPPED}.)
	 *
	 * <p>Carries two tags. {@code kind} (verification / password-reset / operator-approved) separates
	 * the flows, which differ in urgency, in rate-limit budget, and — since #375 — in whether the loss
	 * is self-healing at all: a lost recovery mail is re-requestable, a lost approval notice is not.
	 * As on {@link #MAIL_RECOVERY_DROPPED}, "recovery" here names the vehicle. {@code reason} separates
	 * the two causes the one swallowing catch can produce: a dead relay, and a structurally broken
	 * suppression lookup that loses the mail before the relay is ever reached (#386's fail-open is
	 * scoped to <em>transient</em> failures, so a broken grant or schema drift still drops the send).
	 * Without that split a database fault would read as a mail fault and page the wrong system. The
	 * emitter owns both vocabularies — see {@code TransactionalMailService} and the observability
	 * runbook.
	 *
	 * <p><strong>The registry vehicle has no equivalent, deliberately.</strong> Its transport failure
	 * propagates, leaving the event publication outstanding, so {@link #OUTBOX_PENDING} already
	 * accounts for it — a second series would double-count the same event.
	 */
	public static final String MAIL_RECOVERY_FAILED = "riviera.mail.recovery.failed";

	/**
	 * Counter: booking-confirmation mails the registry listener <em>gave up on</em> because a fact it
	 * needs — the booking, the set, or the contact — did not resolve (#428). The fourth and last of
	 * the mail-loss names, and the only one that measures a loss <strong>no gauge could otherwise
	 * see</strong>.
	 *
	 * <p><strong>That invisibility is the whole reason it exists.</strong>
	 * {@link #MAIL_RECOVERY_FAILED} explains why the registry vehicle needs no <em>transport</em>
	 * counter: a transport failure propagates, so the publication stays outstanding and
	 * {@link #OUTBOX_PENDING} carries it. This is that argument's exact inverse — the listener
	 * returns <em>normally</em>, so the Event Publication Registry marks the publication complete and
	 * the outbox gauge never moves. Completing it is correct (none of the three facts can appear
	 * later, so a retry would park a permanently-failing publication in the outbox); giving up
	 * <em>silently</em> was not.
	 *
	 * <p>Do not sum the four. A shed is deferred, a drop was refused, a failure was attempted — this
	 * one was abandoned, and it is the only one that is <strong>never</strong> retried.
	 *
	 * <p>Carries a {@code reason} tag ({@code no-booking} / {@code no-set} / {@code no-contact})
	 * because the three implicate three different modules — {@code booking}, {@code venue},
	 * {@code customer} — and the module to investigate is what an operator acts on. <strong>Read any
	 * increment as a data-integrity fault, not a relay fault:</strong> all three rows are
	 * FK-protected and never hard-deleted (erasure tombstones in place), so none is reachable through
	 * any application path. The emitter owns the vocabulary — see
	 * {@code BookingConfirmationMailListener} and the observability runbook.
	 */
	public static final String MAIL_CONFIRMATION_ABANDONED = "riviera.mail.confirmation.abandoned";

	private ObservabilityMetrics() {
	}
}
