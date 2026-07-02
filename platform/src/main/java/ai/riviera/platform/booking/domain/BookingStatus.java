package ai.riviera.platform.booking.domain;

/**
 * The lifecycle states of a {@code Booking}. Mirrors the {@code booking.status} CHECK
 * constraint (V5, widened by V19) one-to-one — keep the Java enum and the SQL token set in
 * lockstep (pinned by {@code BookingMigrationIT.everyEnumStatusAccepted}).
 *
 * <p>Instant Book starts at {@link #AWAITING_PAYMENT} → {@link #CONFIRMED}. Request-to-Book
 * (issue #98) starts at {@link #PENDING_REQUEST}: venue accept → {@link #AWAITING_PAYMENT}
 * (then the identical payment spine); venue decline → {@link #DECLINED}; no response before
 * the request deadline → {@link #EXPIRED}. An accepted-but-unpaid request is swept to
 * {@link #CANCELLED} like any abandoned payment. {@link #COMPLETED}/{@link #NO_SHOW} are
 * admitted by the schema (closed value set) and exercised by later slices.
 */
public enum BookingStatus {
	PENDING_REQUEST,
	AWAITING_PAYMENT,
	CONFIRMED,
	CANCELLED,
	COMPLETED,
	NO_SHOW,
	DECLINED,
	EXPIRED
}
