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
	 * #428, {@link #MAIL_CANCELLATION_ABANDONED} #374, {@link #MAIL_PAYMENT_DUE_ABANDONED} #373):
	 * <strong>do not sum them.</strong> This one is the only member of the set that is expected
	 * to be re-delivered, which is precisely why summing would mislead.
	 */
	public static final String MAIL_REGISTRY_SHED = "riviera.mail.registry.shed";

	/**
	 * Counter: mails the bounded in-memory dispatcher <strong>never ran</strong>, and therefore never
	 * sent (#415, widened by #434). <strong>"Recovery" in this name is the vehicle, not the flow</strong>
	 * — it was coined when that dispatcher carried only email verification and password reset; since
	 * #375 it also carries the operator-approval notice, which is no recovery flow at all. The name
	 * stays because renaming a shipped metric breaks whatever reads it — and since #442 a {@code kind}
	 * tag is what separates the flows, on this series exactly as on {@link #MAIL_RECOVERY_FAILED}. It
	 * did not always: the counter is raised by {@code AsyncMailDispatcher}, whose interface was
	 * {@code dispatch(Runnable)}, so for two slices the kind was simply not in scope where the
	 * increment happened. Widening that seam is all #442 was. The sibling
	 * {@link #MAIL_REGISTRY_SHED} reserved this name and declined to declare it, on the rule that a name
	 * ships with the emitter that gives it meaning.
	 *
	 * <p><strong>It measures a strictly worse event than the shed does.</strong> A shed registry mail
	 * is deferred — its event publication stays outstanding, and since #405 either a restart or the
	 * admin resubmission lever republishes it, no longer a restart alone. A dropped
	 * recovery mail is <em>gone</em>: the payload is a single-use bearer credential the registry may
	 * not persist (ADR-0011 decision 5), so nothing retries it. Read an increment as one person who will
	 * wait for a mail that is never coming, and read the {@code kind} tag for <em>which</em> person to
	 * go and find. That dimension stopped being optional at #375: the kinds no longer share one
	 * consequence, since a {@code verification} or {@code password-reset} loss self-heals when they ask
	 * again while an {@code operator-approved} loss does not, nothing re-sending it and nobody having
	 * told them to expect it (ADR-0011 decision 5, amended #439 and #442). <strong>The tag names the
	 * flow, never the person</strong> — invariant #7 keeps the address out of metrics and logs — so an
	 * {@code operator-approved} increment sends you to that window's approval log, which is a far
	 * shorter walk than reconciling an untagged one against it.
	 *
	 * <p>Carries a {@code reason} tag distinguishing a saturated pool (a degraded relay — act) from the
	 * two ways a redeploy loses a mail: the request that reached a closed pool ({@code shutdown}), and
	 * the send that was accepted but still queued when the drain window expired ({@code abandoned},
	 * #434). All three are real losses, so all three are counted; the tag is what keeps a deploy from
	 * reading as an outage. <strong>All three carry {@code kind} too</strong> (#442) — the drain path
	 * included, which took the most work and mattered most: a {@code kind} query that silently
	 * under-counted a third of the series would be worse than the honest absence it replaced.
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
	 * <em>every</em> send and raises this one immediately. Do not sum the six mail counters — they
	 * measure a deferral, a send the pool never ran, an attempt that failed, and — on three separate
	 * series (#428, #374, #373) — a booking mail given up on. ("Never ran" rather than "refused" since #434
	 * widened the first of those — see {@link #MAIL_RECOVERY_DROPPED}.)
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
	 * needs — the booking, the set, or the contact — did not resolve (#428). The first of the three
	 * <em>abandoned</em> names ({@link #MAIL_CANCELLATION_ABANDONED} #374 and
	 * {@link #MAIL_PAYMENT_DUE_ABANDONED} #373 are the others), and the kind
	 * of loss <strong>no gauge could otherwise see</strong>.
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
	 * <p>Do not sum them. A shed is deferred, a drop was refused, a failure was attempted — an
	 * abandoned mail is the only kind that is <strong>never</strong> retried; and the three abandoned
	 * series are not each other's totals either ({@link #MAIL_CANCELLATION_ABANDONED} says why).
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

	/**
	 * Counter: cancellation/refund mails the registry listener <em>gave up on</em> because a fact it
	 * needs — the booking, the set, or the contact — did not resolve (#374). The sibling of
	 * {@link #MAIL_CONFIRMATION_ABANDONED}: same vehicle, same invisibility, same three
	 * {@code reason} tag values, different consequence. An increment here means a tourist whose
	 * booking was cancelled has no written record of it, and — where a refund applied — none of the
	 * money owed back.
	 *
	 * <p><strong>A sibling series rather than a {@code kind} tag on the confirmation counter, and the
	 * reason is a rule rather than a preference.</strong> Tagging would have been the #442 move, but
	 * #442 could make it because {@code MAIL_RECOVERY_*} names a <em>vehicle</em>; this name states a
	 * <em>flow</em>, so a {@code kind=cancellation} on a metric called {@code confirmation} would be a
	 * contradiction rather than a dimension. Renaming the shipped one to fit is barred by the standing
	 * rule that a shipped metric name breaks whatever reads it. What #442's lesson does reach is the
	 * {@code reason} dimension, which is why both series read it off one enum
	 * ({@code notification.application.MissingBookingFact}) and cannot drift into two spellings.
	 *
	 * <p><strong>Do not sum this with its sibling.</strong> They answer different questions and are
	 * acted on differently: an abandoned confirmation is chased by reaching the tourist with their
	 * arrival code (invariant #7 applies to that errand), while an abandoned cancellation is chased by
	 * confirming the refund itself actually moved — the money is unaffected by this loss, only the
	 * record of it. Both are data-integrity signals, never relay ones; see the observability runbook.
	 */
	public static final String MAIL_CANCELLATION_ABANDONED = "riviera.mail.cancellation.abandoned";

	/**
	 * Counter: payment-due mails the registry listener <em>gave up on</em> because a fact it needs —
	 * the booking, the set, or the contact — did not resolve (#373). The third of the
	 * <em>abandoned</em> series, on the same vehicle, with the same invisibility and the same three
	 * {@code reason} tag values read off the same enum; the naming rule
	 * {@link #MAIL_CANCELLATION_ABANDONED} states applies unchanged, and so does <strong>do not sum
	 * them</strong>.
	 *
	 * <p>What differs is the consequence, and it is the sharpest of the three. The other two describe
	 * a record that failed to arrive about something already settled — a booking confirmed, a
	 * cancellation decided. This one is the guest's <em>only</em> notice that an accepted request must
	 * be paid for, and by when: the app shows it only to someone who happens to reload. An increment
	 * therefore predicts a specific future loss — a set the abandoned sweep releases at the deadline,
	 * a guest who never learned there was one, and a venue that held a spot for nothing.
	 *
	 * <p>That makes the errand different too. An abandoned confirmation is chased by getting the
	 * tourist their arrival code and an abandoned cancellation by confirming the refund moved; this
	 * one is chased <strong>before the deadline passes</strong> or not usefully at all, which is why
	 * its {@code ERROR} line carries the booking id and why the deadline is the thing to look up
	 * first.
	 */
	public static final String MAIL_PAYMENT_DUE_ABANDONED = "riviera.mail.payment-due.abandoned";

	private ObservabilityMetrics() {
	}
}
