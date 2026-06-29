package ai.riviera.platform.payment.api;

/**
 * The {@code payment} module's <strong>inbound</strong> published port for issuing a refund (U6) —
 * the seam the {@code booking} module calls when it cancels a booking. Distinct from
 * {@link CheckoutPort} (collection): both are driving ports {@code booking} calls, keeping the
 * dependency direction {@code booking → payment::api} (so a {@code BookingCancelled} event consumed
 * by {@code payment} — which would cycle — is not needed; invariant #11).
 *
 * <p>Collect-only — <strong>no Stripe Connect</strong> (ADR-0002 / invariant #8). The refund is
 * server-initiated through the outbound {@code PaymentGateway} with an idempotency key derived from
 * the booking id, so a retried cancel never double-refunds. The {@code amount} is computed
 * server-side by {@code booking} from the cancellation policy (invariant #10) — never supplied by
 * the client.
 */
public interface RefundPort {

	/**
	 * Refund {@code amount} for the given booking. Returns a typed {@link RefundResult} (never throws
	 * on an expected gateway failure). Under the default stub profile the refund succeeds in-process;
	 * under the {@code stripe} profile it creates a Stripe Refund against the booking's PaymentIntent.
	 */
	RefundResult refund(BookingRef booking, Money amount);
}
