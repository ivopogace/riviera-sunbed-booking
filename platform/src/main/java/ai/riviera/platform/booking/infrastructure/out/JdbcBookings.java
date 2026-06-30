package ai.riviera.platform.booking.infrastructure.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.in.DailyBooking;
import ai.riviera.platform.booking.application.out.BookingRecord;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.CancelledBooking;
import ai.riviera.platform.booking.application.out.ClaimRef;
import ai.riviera.platform.booking.application.out.ConfirmedBooking;
import ai.riviera.platform.booking.application.out.NewBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * JDBC adapter for {@link Bookings} — explicit SQL via {@link JdbcClient}, no JPA (invariant
 * #1). Package-private; only the port is referenced cross-layer. Both writes join the ambient
 * transaction opened by {@code CreateBookingService} (no own {@code @Transactional}), so the
 * insert, the availability claim, and the confirm commit or roll back together.
 */
@Repository
class JdbcBookings implements Bookings {

	// Named-parameter keys reused across the lifecycle SQL (keep them in lockstep, no typos).
	private static final String PARAM_STATUS = "status";
	private static final String PARAM_AWAITING = "awaiting";
	private static final String PARAM_CONFIRMED = "confirmed";

	// Result-column names reused across the row mappers (keep in lockstep with the SELECT/RETURNING).
	private static final String COL_VENUE_ID = "venue_id";
	private static final String COL_SET_ID = "set_id";
	private static final String COL_BOOKING_DATE = "booking_date";
	private static final String COL_AMOUNT_MINOR = "amount_minor";
	private static final String COL_AMOUNT_CURRENCY = "amount_currency";

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
				.param(PARAM_STATUS, BookingStatus.AWAITING_PAYMENT.name())
				.query(Long.class)
				.optional()
				.map(OptionalLong::of)
				.orElseGet(OptionalLong::empty);
	}

	@Override
	public Optional<BookingRecord> findByCode(String code) {
		return jdbc.sql("""
				SELECT id, code, status, venue_id, set_id, booking_date,
				       amount_minor, amount_currency, cancelled_at, refund_minor
				FROM booking
				WHERE code = :code
				""")
				.param("code", code)
				.query((rs, rowNum) -> {
					java.sql.Timestamp cancelledAt = rs.getTimestamp("cancelled_at");
					Long refundMinor = rs.getObject("refund_minor", Long.class);
					return new BookingRecord(
							rs.getLong("id"), rs.getString("code"),
							BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
							new VenueId(rs.getLong(COL_VENUE_ID)), new SetId(rs.getLong(COL_SET_ID)),
							rs.getObject(COL_BOOKING_DATE, LocalDate.class),
							rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
							cancelledAt == null ? null : cancelledAt.toInstant(), refundMinor);
				})
				.optional();
	}

	@Override
	public ConfirmedBooking confirm(long bookingId, Instant confirmedAt) {
		// Strict stub-path confirm. RETURNING yields the confirmed facts only on a real transition,
		// so the empty case (booking not AWAITING_PAYMENT) is a guard, not a false confirmation.
		return confirmReturningFacts(bookingId, confirmedAt).orElseThrow(() -> new IllegalStateException(
				"expected to confirm exactly one AWAITING_PAYMENT booking, updated 0"));
	}

	@Override
	public Optional<ConfirmedBooking> confirmFromPayment(long bookingId, Instant confirmedAt) {
		// Idempotent webhook confirm: the guarded WHERE makes a re-delivery (already CONFIRMED) or a
		// cancelled booking a 0-row no-op (empty) rather than an error. Two-layer idempotency with
		// the stripe_webhook_event dedup (invariant #8). A present result == it actually transitioned,
		// so the caller publishes exactly one BookingConfirmed.
		return confirmReturningFacts(bookingId, confirmedAt);
	}

	/**
	 * The shared {@code AWAITING_PAYMENT → CONFIRMED} update, {@code RETURNING} the facts the
	 * {@code BookingConfirmed} payload needs. Empty iff no row transitioned (the guard both confirm
	 * paths build their semantics on). Built atomically with the transition — no second read race.
	 */
	private Optional<ConfirmedBooking> confirmReturningFacts(long bookingId, Instant confirmedAt) {
		return jdbc.sql("""
				UPDATE booking
				SET status = :status, confirmed_at = :at
				WHERE id = :id AND status = :awaiting
				RETURNING id, venue_id, set_id, booking_date, amount_minor, amount_currency
				""")
				.param(PARAM_STATUS, BookingStatus.CONFIRMED.name())
				.param("at", java.sql.Timestamp.from(confirmedAt))
				.param("id", bookingId)
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.query((rs, rowNum) -> new ConfirmedBooking(
						rs.getLong("id"), new VenueId(rs.getLong(COL_VENUE_ID)),
						new SetId(rs.getLong(COL_SET_ID)), rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY)))
				.optional();
	}

	@Override
	public Optional<CancelledBooking> cancelConfirmed(long bookingId, Instant cancelledAt,
			long refundMinor, ai.riviera.platform.booking.api.RefundReason reason) {
		// Guarded CONFIRMED -> CANCELLED. RETURNING yields the facts only on a real transition, so a
		// double-cancel (already CANCELLED) is a 0-row empty no-op — the caller then releases the set,
		// refunds, and publishes BookingCancelled exactly once. The reason (POLICY/WEATHER, U9) is the
		// audit of why the cancellation happened (invariant #10).
		return jdbc.sql("""
				UPDATE booking
				SET status = :cancelled, cancelled_at = :at, refund_minor = :refund, cancel_reason = :reason
				WHERE id = :id AND status = :confirmed
				RETURNING id, venue_id, set_id, booking_date, amount_minor, amount_currency
				""")
				.param("cancelled", BookingStatus.CANCELLED.name())
				.param("at", java.sql.Timestamp.from(cancelledAt))
				.param("refund", refundMinor)
				.param("reason", reason.name())
				.param("id", bookingId)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.query((rs, rowNum) -> new CancelledBooking(
						rs.getLong("id"), new VenueId(rs.getLong(COL_VENUE_ID)),
						new SetId(rs.getLong(COL_SET_ID)), rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY)))
				.optional();
	}

	@Override
	public List<DailyBooking> findConfirmedForVenueOn(VenueId venueId, LocalDate date) {
		// Staff daily view (U8): a venue's CONFIRMED bookings for one day, ordered by set. Served by
		// booking_venue_id_idx (V5); the (booking_date, status) filter narrows the venue's rows. The
		// code is selected for staff verification (invariant #7) — returned to the operator-gated
		// caller, never logged here.
		return jdbc.sql("""
				SELECT set_id, code
				FROM booking
				WHERE venue_id = :venue AND booking_date = :date AND status = :confirmed
				ORDER BY set_id
				""")
				.param("venue", venueId.value())
				.param("date", date)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.query((rs, rowNum) -> new DailyBooking(
						new SetId(rs.getLong(COL_SET_ID)), rs.getString("code")))
				.list();
	}

	@Override
	public List<BookingId> findExpirableAwaitingPayment(Instant olderThan) {
		// Abandoned-payment TTL sweep candidates (issue #51): AWAITING_PAYMENT rows created before the
		// cutoff. Served by booking_awaiting_created_idx (V13), a partial index on the AWAITING_PAYMENT
		// subset. Ids only — the sweep cancels each PaymentIntent then transitions via the guarded UPDATE.
		return jdbc.sql("""
				SELECT id
				FROM booking
				WHERE status = :awaiting AND created_at < :cutoff
				ORDER BY id
				""")
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.param("cutoff", java.sql.Timestamp.from(olderThan))
				.query((rs, rowNum) -> new BookingId(rs.getLong("id")))
				.list();
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
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.query((rs, rowNum) -> new ClaimRef(new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
				.optional();
	}
}
