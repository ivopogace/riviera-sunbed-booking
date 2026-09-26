package ai.riviera.platform.payment.api;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.RefundResult;

/**
 * The {@code payment} module's <strong>inbound</strong> port for refunding one booking, called by
 * {@code booking} when it cancels; a {@code BookingCancelled} listener in {@code payment} instead
 * would cycle (invariant #11). Collect-only, <strong>no Stripe Connect</strong> (ADR-0002). The
 * {@code amount} is decided server-side by {@code booking} (invariant #10), never by the client.
 *
 * <p>At most one refund per booking, however late a retry lands: the gateway is asked what it holds
 * before creating one (idempotency keys expire). Rationale: {@code RESPONSIBILITIES.md} §payment.
 */
public interface RefundPort {

	/**
	 * Refund {@code amount} for the given booking. Returns a typed {@link RefundResult} (never throws
	 * on an expected gateway failure). Under the default stub profile the refund succeeds in-process;
	 * under the {@code stripe} profile it creates a Stripe Refund against the booking's PaymentIntent.
	 */
	RefundResult refund(BookingRef booking, Money amount);
}
