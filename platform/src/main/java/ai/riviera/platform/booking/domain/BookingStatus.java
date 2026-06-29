package ai.riviera.platform.booking.domain;

/**
 * The lifecycle states of a {@code Booking}. Mirrors the {@code booking.status} CHECK
 * constraint (V5) one-to-one — keep the Java enum and the SQL token set in lockstep.
 *
 * <p>U3 uses {@link #AWAITING_PAYMENT} → {@link #CONFIRMED} (the Instant-Book path with the
 * stub gateway). {@link #CANCELLED}/{@link #COMPLETED}/{@link #NO_SHOW} are admitted by the
 * schema now (closed value set) and exercised by later slices (U6+).
 */
public enum BookingStatus {
	AWAITING_PAYMENT,
	CONFIRMED,
	CANCELLED,
	COMPLETED,
	NO_SHOW
}
