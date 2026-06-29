package ai.riviera.platform.booking.infrastructure.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.OptionalLong;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.ClaimRef;
import ai.riviera.platform.booking.application.out.NewBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.api.SetId;

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
	public OptionalLong insertAwaitingPayment(NewBooking b) {
		// ON CONFLICT (code) DO NOTHING makes a code collision a no-op (empty result), NOT a
		// thrown unique violation — so the caller's regenerate-and-retry works WITHOUT aborting
		// the surrounding transaction (a thrown violation would poison it). FK/CHECK failures
		// still throw, as they should. RETURNING yields the id only on a real insert.
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :customer, :date, :amount, :currency, :status)
				ON CONFLICT (code) DO NOTHING
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
				.optional()
				.map(OptionalLong::of)
				.orElseGet(OptionalLong::empty);
	}

	@Override
	public void confirm(long bookingId, Instant confirmedAt) {
		int updated = jdbc.sql("""
				UPDATE booking
				SET status = :status, confirmed_at = :at
				WHERE id = :id AND status = :awaiting
				""")
				.param("status", BookingStatus.CONFIRMED.name())
				.param("at", java.sql.Timestamp.from(confirmedAt))
				.param("id", bookingId)
				.param("awaiting", BookingStatus.AWAITING_PAYMENT.name())
				.update();
		// Guard against a silent no-op: a 0-row update means the booking was not AWAITING_PAYMENT
		// (already confirmed/cancelled, or a replayed confirm — relevant once U4 confirms via the
		// webhook). Surfacing it prevents returning a false confirmation.
		if (updated != 1) {
			throw new IllegalStateException(
					"expected to confirm exactly one AWAITING_PAYMENT booking, updated " + updated);
		}
	}

	@Override
	public boolean confirmFromPayment(long bookingId, Instant confirmedAt) {
		// Idempotent webhook confirm: the guarded WHERE makes a re-delivery (already CONFIRMED) or
		// a cancelled booking a 0-row no-op rather than an error. Two-layer idempotency with the
		// stripe_webhook_event dedup (invariant #8).
		int updated = jdbc.sql("""
				UPDATE booking
				SET status = :status, confirmed_at = :at
				WHERE id = :id AND status = :awaiting
				""")
				.param("status", BookingStatus.CONFIRMED.name())
				.param("at", java.sql.Timestamp.from(confirmedAt))
				.param("id", bookingId)
				.param("awaiting", BookingStatus.AWAITING_PAYMENT.name())
				.update();
		return updated == 1;
	}

	@Override
	public Optional<ClaimRef> cancelAwaitingPayment(long bookingId) {
		// UPDATE ... RETURNING yields the (set, date) only when a row actually transitioned, so the
		// caller releases the availability claim exactly once (invariant #2). A booking no longer
		// AWAITING_PAYMENT returns empty — nothing to release.
		return jdbc.sql("""
				UPDATE booking
				SET status = :cancelled
				WHERE id = :id AND status = :awaiting
				RETURNING set_id, booking_date
				""")
				.param("cancelled", BookingStatus.CANCELLED.name())
				.param("id", bookingId)
				.param("awaiting", BookingStatus.AWAITING_PAYMENT.name())
				.query((rs, rowNum) -> new ClaimRef(new SetId(rs.getLong("set_id")),
						rs.getObject("booking_date", LocalDate.class)))
				.optional();
	}
}
