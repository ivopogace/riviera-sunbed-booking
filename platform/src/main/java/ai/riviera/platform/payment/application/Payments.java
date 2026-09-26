package ai.riviera.platform.payment.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;

/**
 * The {@code payment} module's persistence port for the collection record: correlates verified
 * webhooks to the bookings they collect for, and records collection and refunds per booking (one
 * PaymentIntent may collect for several; each is refunded on its own).
 *
 * <p>Every write is a <strong>guarded single statement that reports whether it moved</strong>, never
 * a read-then-write: Stripe promises neither ordering nor single delivery, and a refund races its own
 * failure webhook. A caller that ignores a {@code false} will report money moved that did not.
 */
public interface Payments {

	/** Persist a new PaymentIntent record in {@code REQUIRES_PAYMENT}, with one row per share. */
	void register(NewPayment payment);

	/**
	 * The pay-on-accept read: the booking's PaymentIntent credentials while it is still
	 * {@code REQUIRES_PAYMENT} with a {@code client_secret} on record; empty otherwise (stub profile,
	 * pre-V19 rows included).
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
	 * Apply a webhook-derived outcome, guarded: only an open collection ({@code REQUIRES_PAYMENT} or the
	 * retryable {@code FAILED}) moves, so a late event cannot overwrite a terminal one (invariant #8).
	 * {@code false} for a terminal record and an unknown intent alike.
	 */
	boolean markStatus(String paymentIntentId, PaymentStatus status);

	/**
	 * The PaymentIntent id collecting for a booking, or empty if none is known (e.g. the stub
	 * profile records no payment). Used by the Stripe refund path to target the {@code Refund}.
	 */
	Optional<String> findIntentByBookingRef(BookingRef booking);

	/**
	 * Record, committed <strong>before</strong> the gateway call, an unresolved refund obligation — what
	 * tells our not-yet-recorded refund from a manual gateway one. Cleared by every in-app resolution,
	 * kept on a {@code Failed} return. Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	void markRefundAttempted(BookingRef booking);

	/**
	 * Record the refund on the booking's share, derive {@code REFUNDED}/{@code PARTIALLY_REFUNDED}, and
	 * clear the owed flag. Moves only a collected payment, never a refund already reported dead; success
	 * on {@code false} strands a guest owed money. Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
	 */
	boolean markRefunded(BookingRef booking, long refundedMinor, String refundId);

	/**
	 * The refund-relevant state of the booking's share — the collection's status plus the share's
	 * {@code refunded_minor} — or empty when no row exists (the stub profile records no payment).
	 */
	Optional<RefundState> findRefundState(BookingRef booking);

	/**
	 * Un-record a refund the gateway reports returned no money: clear the share's refund, re-derive the
	 * collection's status, and leave the failure trace that lists the booking as owed. Guarded on the
	 * recorded refund id, so a re-delivery or an already-replaced refund is a no-op.
	 */
	boolean markRefundFailed(String refundId);

	/**
	 * Mark the share as owing a refund that died <strong>before</strong> it was recorded; the caller
	 * resolves the booking. Moves only with a {@link #markRefundAttempted} on record and no refund
	 * recorded, so a failed manual gateway refund moves nothing (RESPONSIBILITIES.md §payment).
	 */
	boolean markUnrecordedRefundFailed(BookingRef booking, String refundId);

	/**
	 * How many bookings currently owe a refund the gateway would not issue — <strong>distinct refunds
	 * owed</strong>, unlike the failure counter, which re-increments on every resubmission.
	 */
	long owedRefundCount();
}
