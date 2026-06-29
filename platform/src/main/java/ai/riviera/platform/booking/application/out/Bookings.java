package ai.riviera.platform.booking.application.out;

import java.time.Instant;

/**
 * The {@code booking} module's outbound persistence port (driven seam). Two narrow writes
 * model the Instant-Book lifecycle: insert the row in {@code AWAITING_PAYMENT}, then
 * {@code confirm} it once the stub gateway succeeds. Separating persistence from the
 * orchestration ({@code CreateBookingService}) keeps the SQL out of the use case and lets the
 * branch logic be unit-tested with a fake. Implemented by {@code JdbcBookings} (explicit SQL,
 * invariant #1).
 */
public interface Bookings {

	/**
	 * Insert a new booking in {@code AWAITING_PAYMENT} and return its generated id. Throws a
	 * {@code DataIntegrityViolationException} if the booking code collides with an existing one
	 * (the caller regenerates and retries — invariant #7's {@code UNIQUE(code)}).
	 */
	long insertAwaitingPayment(NewBooking booking);

	/** Transition the booking to {@code CONFIRMED}, stamping {@code confirmed_at}. */
	void confirm(long bookingId, Instant confirmedAt);
}
