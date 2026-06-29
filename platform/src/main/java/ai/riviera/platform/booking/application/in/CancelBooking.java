package ai.riviera.platform.booking.application.in;

/**
 * The cancel-a-booking use case (U6, issue #11) — the inbound port the web adapter calls to cancel a
 * booking by its {@code code} (the bearer credential, invariant #7). The refund is computed
 * server-side from the cancellation policy (invariant #10); the caller supplies <strong>no</strong>
 * amount. Internal to {@code booking} ({@code application.in}), not cross-module {@code api/}.
 */
public interface CancelBooking {

	/** Cancel the booking with {@code code}; returns the typed {@link CancelOutcome}. */
	CancelOutcome cancel(String code);
}
