package ai.riviera.platform.booking.domain;

/**
 * The lifecycle states of a {@code Booking}. Mirrors the {@code booking.status} CHECK
 * constraint (V5, widened by V19) one-to-one — keep the Java enum and the SQL token set in
 * lockstep (pinned by {@code BookingMigrationIT.everyEnumStatusAccepted}).
 *
 * <p>Instant Book starts at {@link #AWAITING_PAYMENT} → {@link #CONFIRMED}. Request-to-Book
 * (issue #98) starts at {@link #PENDING_REQUEST} and has <strong>three</strong> terminal legs,
 * one per party that can end it: venue decline → {@link #DECLINED}; nobody answered before the
 * request deadline → {@link #EXPIRED}; the guest retracted their own request → {@link #WITHDRAWN}
 * (issue #123). Venue accept → {@link #AWAITING_PAYMENT} (then the identical payment spine). An
 * accepted-but-unpaid request is swept to {@link #CANCELLED} like any abandoned payment.
 * {@link #COMPLETED}/{@link #NO_SHOW} are admitted by the schema (closed value set) and exercised
 * by later slices.
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
