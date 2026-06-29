package ai.riviera.platform.booking.infrastructure.out;

import java.time.Instant;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.NewBooking;
import ai.riviera.platform.booking.domain.BookingStatus;

/**
 * JDBC adapter for {@link Bookings} — explicit SQL via {@link JdbcClient}, no JPA (invariant
 * #1). Package-private; only the port is referenced cross-layer. Both writes join the ambient
 * transaction opened by {@code CreateBookingService} (no own {@code @Transactional}), so the
 * insert, the availability claim, and the confirm commit or roll back together.
 */
@Repository
class JdbcBookings implements Bookings {

	private final JdbcClient jdbc;

	JdbcBookings(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public long insertAwaitingPayment(NewBooking b) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :customer, :date, :amount, :currency, :status)
				RETURNING id
				""")
				.param("code", b.code())
				.param("venue", b.venueId().value())
				.param("set", b.setId().value())
				.param("customer", b.customerId().value())
				.param("date", b.bookingDate())
				.param("amount", b.amountMinor())
				.param("currency", b.amountCurrency())
				.param("status", BookingStatus.AWAITING_PAYMENT.name())
				.query(Long.class)
				.single();
	}

	@Override
	public void confirm(long bookingId, Instant confirmedAt) {
		jdbc.sql("""
				UPDATE booking
				SET status = :status, confirmed_at = :at
				WHERE id = :id AND status = :awaiting
				""")
				.param("status", BookingStatus.CONFIRMED.name())
				.param("at", java.sql.Timestamp.from(confirmedAt))
				.param("id", bookingId)
				.param("awaiting", BookingStatus.AWAITING_PAYMENT.name())
				.update();
	}
}
