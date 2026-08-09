package ai.riviera.platform.booking.application.refund;

import ai.riviera.platform.shared.ResubmissionOutcome;

/**
 * The driving port behind the ADMIN refund-outbox surface: read what the registry still owes
 * the refund listener, and re-drive it on demand.
 *
 * <p><strong>Why this exists at all.</strong> The failure path was already correct — the listener
 * throws on {@code RefundResult.Failed} (and a shed submission never runs), so the publication stays
 * durably owed and {@code riviera.outbox.pending} + {@code riviera.refunds.failed} carry it — but the
 * only thing that ever re-read that correctly-incomplete row was an application restart. On Render
 * that made the retry horizon for money owed to a tourist (invariant #10) "the next deploy". This port
 * is the targeted trigger, and nothing more: eligibility, amount, gateway and bulkhead are untouched.
 *
 * <p><strong>Internal, not published.</strong> Its only caller is this module's own admin adapter, so
 * publishing it would add a published surface for a hypothetical seam.
 */
public interface RefundResubmission {

	/** What an admin sees before pressing anything. */
	RefundOutboxStatus status();

	/**
	 * Re-drive every outstanding refund publication, once.
	 *
	 * <p>"Once" is layered: the gateway refuses to create a second refund when it already holds one
	 * ({@code RESPONSIBILITIES.md} §{@code payment} — the layer that does not expire, unlike the
	 * idempotency key this lever can easily outlive), the
	 * registry's {@code markResubmitted} claim skips a publication whose previous resubmission is still
	 * in flight, and what this port adds is a bound on how often the whole scope is swept — with a
	 * caller-visible reason when it refuses ({@link ResubmissionOutcome.AlreadyRunning},
	 * {@link ResubmissionOutcome.CoolingDown}).
	 */
	ResubmissionOutcome resubmit();
}
