package ai.riviera.platform.booking.domain;

/**
 * The lifecycle states of a {@code Booking}. Mirrors the {@code booking.status} CHECK
 * constraint (V5, widened by V19) one-to-one — keep the Java enum and the SQL token set in
 * lockstep (pinned by {@code BookingMigrationIT.everyEnumStatusAccepted}).
 *
 * <p>Instant Book starts at {@link #AWAITING_PAYMENT} → {@link #CONFIRMED}. Request-to-Book
 * starts at {@link #PENDING_REQUEST} and has <strong>three</strong> terminal legs,
 * one per party that can end it: venue decline → {@link #DECLINED}; nobody answered before the
 * request deadline → {@link #EXPIRED}; the guest retracted their own request → {@link #WITHDRAWN}.
 * Venue accept → {@link #AWAITING_PAYMENT} (then the identical payment spine). An
 * accepted-but-unpaid request is swept to {@link #CANCELLED} like any abandoned payment.
 * {@link #COMPLETED} is written by the staff check-in — the guarded scan-to-complete transition on
 * the service date; {@link #NO_SHOW} is admitted by the schema and stays unwritten until the
 * never-checked-in sweep ships.
 *
 * <p>{@link #WITHDRAWN} is deliberately NOT {@link #CANCELLED}: no money was ever collected (a
 * pending request has no PaymentIntent on record — payment-request-on-accept), so
 * {@code CANCELLED} keeps meaning "a confirmed booking was cancelled", with a refund decision
 * behind it.
 */
public enum BookingStatus {
	PENDING_REQUEST,
	AWAITING_PAYMENT,
	CONFIRMED,
	CANCELLED,
	COMPLETED,
	NO_SHOW,
	DECLINED,
	EXPIRED,
	WITHDRAWN
}
