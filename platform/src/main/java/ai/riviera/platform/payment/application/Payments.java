package ai.riviera.platform.payment.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;

/**
 * The {@code payment} module's outbound persistence port (driven seam) for the collection record:
 * the reads that correlate a verified webhook back to the bookings it collects for, and the writes
 * that record what the gateway did about collecting and refunding — per booking, because one
 * PaymentIntent may collect for several and each is refunded on its own.
 *
 * <p>Every write here is a <strong>guarded single statement that reports whether it moved</strong>,
 * never a read-then-write — Stripe promises neither ordering nor a single delivery, and the refund
 * path races its own failure webhook. A caller that ignores a {@code false} will report money moved
 * that did not. Implemented by {@code JdbcPayments} (explicit SQL, invariant #1); internal to the
 * module.
 */
public interface Payments {

	/** Persist a new PaymentIntent record in {@code REQUIRES_PAYMENT}, with one row per share. */
	void register(NewPayment payment);

	/**
	 * The credentials of the PaymentIntent collecting for the booking while it is still
	 * {@code REQUIRES_PAYMENT} and a {@code client_secret} is on record (V19) — the pay-on-accept
	 * read. Empty once the intent succeeded/failed/was canceled, or when no secret was stored (stub
	 * profile, pre-V19 rows).
	 */
	Optional<PaymentCredentials> findPendingCredentials(
			BookingRef booking);

	/**
	 * Every booking a PaymentIntent collects for, in registration order; empty if no such
	 * PaymentIntent is known (e.g. an event for an intent this app did not create) — the webhook
	 * then ignores it.
	 */
	List<BookingRef> findBookingRefsByIntent(String paymentIntentId);

	/**
	 * Apply a webhook-derived outcome to the PaymentIntent's record, guarded: only an <em>open</em>
	 * collection ({@code REQUIRES_PAYMENT} or {@code FAILED}, which is retryable at Stripe) moves, so
	 * a late or out-of-order event cannot overwrite a terminal one (invariant #8). Returns whether a
	 * row actually transitioned — {@code false} for a terminal record and for an unknown intent alike.
	 */
	boolean markStatus(String paymentIntentId, PaymentStatus status);

	/**
	 * The PaymentIntent id collecting for a booking, or empty if none is known (e.g. the stub
	 * profile records no payment). Used by the Stripe refund path to target the {@code Refund}.
	 */
	Optional<String> findIntentByBookingRef(BookingRef booking);

	/**
	 * Record that this platform is <strong>about to ask</strong> the gateway for a refund of the
	 * booking's share. Written before the gateway call, so it is committed and visible while that
	 * call is still in flight.
	 *
	 * <p>It exists to tell two refunds apart that otherwise look identical to a failure webhook: one
	 * this platform issued and has not recorded yet, and one someone issued by hand at the gateway
	 * against the same collection. Only the first is money the platform owes. A 0-row no-op when no
	 * collected payment row exists (the stub profile), which is why nothing is reported back.
	 *
	 * <p>It records an <strong>unresolved refund obligation at the gateway</strong>, not an attempt
	 * ever made. Every in-app resolution clears it — the recording write on success, and both failure
	 * marks — so a booking whose refund landed stops vouching for refunds that follow it. It
	 * deliberately survives a {@code Failed} return: in every one of those branches the platform still
	 * owes the refund, and one of them (a create whose response was lost to a double timeout) is
	 * exactly the case where a refund of ours may exist at the gateway with no id on record.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	void markRefundAttempted(BookingRef booking);

	/**
	 * Record a refund against the booking's share: set its {@code refunded_minor} and the gateway
	 * {@code refundId}, and move the collection's status to {@code REFUNDED} (every share refunded in
	 * full) or {@code PARTIALLY_REFUNDED} — decided by comparing the sum of the shares' refunds to the
	 * collected total. A refund that lands clears the owed flag {@link #markRefundFailed} set: the flag
	 * means "owed now", so a retry that worked takes the booking off the owed list.
	 *
	 * <p>Guarded twice, and returns whether a row actually moved. It moves only a
	 * <strong>collected</strong> payment, so a refund can never assert money the gateway never took;
	 * and never a refund already reported dead, so the losing side of a race against the refund's own
	 * failure webhook does not record a corpse. {@code false} also covers "no payment row" (the stub
	 * profile). A caller that reports success on {@code false} would strand a guest still owed money.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	boolean markRefunded(BookingRef booking, long refundedMinor, String refundId);

	/**
	 * The refund-relevant state of the booking's share — the collection's status plus the share's
	 * {@code refunded_minor} — or empty when no row exists (the stub profile records no payment).
	 */
	Optional<RefundState> findRefundState(BookingRef booking);

	/**
	 * Un-record the refund {@code refundId} because the gateway reports it returned no money: clear
	 * the share's {@code refunded_minor}, re-derive the collection's status from what its other shares
	 * still hold refunded ({@code SUCCEEDED} when nothing), and leave the failure trace
	 * ({@code refund_failed_at} + {@code failed_refund_id}) that makes the booking enumerable as still
	 * owed. Guarded like {@link #markStatus}: only a row still carrying that refund id as a recorded
	 * refund moves, so a re-delivery — or one for a refund a later attempt has already replaced — is a
	 * no-op. Returns whether a row actually moved.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	boolean markRefundFailed(String refundId);

	/**
	 * Mark the booking's share as owing a refund that died <strong>before</strong> it was ever
	 * recorded — the sibling of {@link #markRefundFailed} for the window between the gateway minting
	 * a refund and this app writing it down, which the create's timeout replay can stretch to tens of
	 * seconds. The caller resolves which booking the dead refund was for; this port does not guess.
	 *
	 * <p>Moves a row only when this platform has an attempt on record ({@link #markRefundAttempted})
	 * and no refund recorded for that booking yet, so a failed manual gateway refund — money the
	 * platform never promised — moves nothing and raises no alert. Guarded against re-delivery on the
	 * refund id like its sibling. Returns whether a row actually moved.
	 *
	 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	boolean markUnrecordedRefundFailed(BookingRef booking, String refundId);

	/**
	 * How many bookings currently owe a refund the gateway would not issue — <strong>distinct
	 * refunds owed, not observations</strong>, which is what the failure counter beside it cannot
	 * answer (a stuck refund re-increments that on every resubmission). Falls back to zero as bookings
	 * are settled by hand or by a retry that works.
	 */
	long owedRefundCount();
}
