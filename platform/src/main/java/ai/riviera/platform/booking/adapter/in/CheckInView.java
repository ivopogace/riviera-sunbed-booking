package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;

/**
 * JSON view of a successful check-in: which set the guest holds and the service date.
 * Deliberately code-free — the response identifies the booking by its facts, never by echoing the
 * bearer credential back (invariant #7).
 */
record CheckInView(long setId, LocalDate bookingDate) {
}
