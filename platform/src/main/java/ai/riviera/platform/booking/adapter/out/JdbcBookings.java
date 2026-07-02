package ai.riviera.platform.booking.adapter.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.view.DailyBooking;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.ConfirmedBooking;
import ai.riviera.platform.booking.application.reserve.NewBooking;
import ai.riviera.platform.booking.application.refund.RefundableBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

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
	private static final String PARAM_PENDING = "pending";
	private static final String PARAM_CONFIRMED = "confirmed";
	private static final String PARAM_VENUE = "venue";

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
				.param(PARAM_VENUE, b.venueId().value())
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
	public OptionalLong insertPendingRequest(NewBooking b, Instant requestExpiresAt) {
		// Request-to-Book (issue #98): same ON CONFLICT (code) DO NOTHING contract as the
		// AWAITING_PAYMENT insert — a code collision is an empty retry signal, never a poisoned
		// transaction. The deadline is stored on the row so accept guard + expiry sweep share it.
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :customer, :date, :amount, :currency, :status, :expires)
				ON CONFLICT (code) DO NOTHING
				RETURNING id
				""")
				.param("code", b.code())
				.param(PARAM_VENUE, b.venueId().value())
				.param("set", b.setId().value())
				.param("customer", b.customerId().value())
				.param("date", b.bookingDate())
				.param("amount", b.amountMinor())
				.param("currency", b.amountCurrency())
				.param(PARAM_STATUS, BookingStatus.PENDING_REQUEST.name())
				.param("expires", java.sql.Timestamp.from(requestExpiresAt))
				.query(Long.class)
				.optional()
				.map(OptionalLong::of)
				.orElseGet(OptionalLong::empty);
	}

	@Override
	public Optional<ai.riviera.platform.booking.application.request.AcceptedRequest> acceptPendingRequest(
			long bookingId, VenueId venueId, Instant now) {
		// Guarded venue-scoped accept (issue #98): only a still-pending, still-unexpired request of
		// THIS venue transitions; RETURNING yields the amount facts atomically. accepted_at is the
		// pay-window clock (never created_at — the instant TTL would sweep an accepted request).
		return jdbc.sql("""
				UPDATE booking
				SET status = :awaiting, accepted_at = :now
				WHERE id = :id AND venue_id = :venue AND status = :pending
				  AND request_expires_at > :now
				RETURNING id, amount_minor, amount_currency
				""")
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.param("now", java.sql.Timestamp.from(now))
				.param("id", bookingId)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new ai.riviera.platform.booking.application.request.AcceptedRequest(
						rs.getLong("id"), rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY)))
				.optional();
	}

	@Override
	public boolean revertAcceptToPending(long bookingId) {
		// Compensation for a failed payment-request issuance (no PI exists, so nothing can race
		// this back-transition). Restores the original deadline by leaving request_expires_at as-is.
		return jdbc.sql("""
				UPDATE booking
				SET status = :pending, accepted_at = NULL
				WHERE id = :id AND status = :awaiting
				""")
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.param("id", bookingId)
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.update() == 1;
	}

	@Override
	public Optional<ClaimRef> declinePending(long bookingId, VenueId venueId) {
		// Guarded venue-scoped decline: RETURNING the (set, date) iff it transitioned, so the
		// caller releases the soft-hold exactly once (invariant #2). No deadline guard — see port.
		return jdbc.sql("""
				UPDATE booking
				SET status = :declined
				WHERE id = :id AND venue_id = :venue AND status = :pending
				RETURNING set_id, booking_date
				""")
				.param("declined", BookingStatus.DECLINED.name())
				.param("id", bookingId)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new ClaimRef(new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
				.optional();
	}

	@Override
	public Optional<ai.riviera.platform.booking.application.request.RequestSnapshot> requestSnapshot(
			long bookingId, VenueId venueId) {
		// Venue-scoped: a foreign venue's booking reads as absent (invariant #13).
		return jdbc.sql("""
				SELECT status, request_expires_at
				FROM booking
				WHERE id = :id AND venue_id = :venue
				""")
				.param("id", bookingId)
				.param(PARAM_VENUE, venueId.value())
				.query((rs, rowNum) -> {
					java.sql.Timestamp expires = rs.getTimestamp("request_expires_at");
					return new ai.riviera.platform.booking.application.request.RequestSnapshot(
							BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
							expires == null ? null : expires.toInstant());
				})
				.optional();
	}

	@Override
	public List<ai.riviera.platform.booking.application.request.PendingRequestRow> findPendingRequestsForVenue(
			VenueId venueId) {
		// Operator queue (issue #98): pending requests, most urgent deadline first. Deliberately
		// does NOT select the code (invariant #7 — the operator acts by id). Served by
		// booking_venue_id_idx; the PENDING_REQUEST slice per venue is tiny.
		return jdbc.sql("""
				SELECT id, set_id, booking_date, customer_id, amount_minor, amount_currency,
				       created_at, request_expires_at
				FROM booking
				WHERE venue_id = :venue AND status = :pending
				ORDER BY request_expires_at, id
				""")
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new ai.riviera.platform.booking.application.request.PendingRequestRow(
						rs.getLong("id"), new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						new ai.riviera.platform.customer.vocabulary.CustomerId(rs.getLong("customer_id")),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
						rs.getTimestamp("created_at").toInstant(),
						rs.getTimestamp("request_expires_at").toInstant()))
				.list();
	}

	@Override
	public Optional<BookingRecord> findByCode(String code) {
		return jdbc.sql("""
				SELECT id, code, status, venue_id, set_id, booking_date,
				       amount_minor, amount_currency, cancelled_at, refund_minor, request_expires_at
				FROM booking
				WHERE code = :code
				""")
				.param("code", code)
				.query((rs, rowNum) -> {
					java.sql.Timestamp cancelledAt = rs.getTimestamp("cancelled_at");
					Long refundMinor = rs.getObject("refund_minor", Long.class);
					java.sql.Timestamp requestExpiresAt = rs.getTimestamp("request_expires_at");
					return new BookingRecord(
							rs.getLong("id"), rs.getString("code"),
							BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
							new VenueId(rs.getLong(COL_VENUE_ID)), new SetId(rs.getLong(COL_SET_ID)),
							rs.getObject(COL_BOOKING_DATE, LocalDate.class),
							rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
							cancelledAt == null ? null : cancelledAt.toInstant(), refundMinor,
							requestExpiresAt == null ? null : requestExpiresAt.toInstant());
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
			long refundMinor, ai.riviera.platform.booking.vocabulary.RefundReason reason) {
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
				.param(PARAM_VENUE, venueId.value())
				.param("date", date)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.query((rs, rowNum) -> new DailyBooking(
						new SetId(rs.getLong(COL_SET_ID)), rs.getString("code")))
				.list();
	}

	@Override
	public List<RefundableBooking> findConfirmedForWeatherRefund(VenueId venueId, LocalDate date) {
		// Admin weather refund (U9): a venue's CONFIRMED bookings for one washed-out day, id + amount.
		// Served by booking_venue_id_idx (V5); the (booking_date, status) filter narrows the venue's
		// rows. The amount is the FULL refund the caller stamps via the guarded cancelConfirmed.
		return jdbc.sql("""
				SELECT id, amount_minor
				FROM booking
				WHERE venue_id = :venue AND booking_date = :date AND status = :confirmed
				ORDER BY id
				""")
				.param(PARAM_VENUE, venueId.value())
				.param("date", date)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.query((rs, rowNum) -> new RefundableBooking(
						rs.getLong("id"), rs.getLong(COL_AMOUNT_MINOR)))
				.list();
	}

	@Override
	public List<BookingId> findExpirableAwaitingPayment(Instant createdBefore, Instant acceptedBefore) {
		// Abandoned-payment sweep candidates, two clocks (issues #51/#98): an instant booking
		// (accepted_at IS NULL) expires on the creation clock — served by
		// booking_awaiting_created_idx (V13); an accepted request expires on the accept clock —
		// served by booking_awaiting_accepted_idx (V19). Never the other way around: an accepted
		// request judged by created_at would be swept the moment it was accepted.
		return jdbc.sql("""
				SELECT id
				FROM booking
				WHERE status = :awaiting
				  AND ((accepted_at IS NULL AND created_at < :createdBefore)
				    OR (accepted_at IS NOT NULL AND accepted_at < :acceptedBefore))
				ORDER BY id
				""")
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.param("createdBefore", java.sql.Timestamp.from(createdBefore))
				.param("acceptedBefore", java.sql.Timestamp.from(acceptedBefore))
				.query((rs, rowNum) -> new BookingId(rs.getLong("id")))
				.list();
	}

	@Override
	public List<ClaimRef> expirePendingRequests(Instant now) {
		// Request-expiry sweep (issue #98): one guarded bulk transition; RETURNING yields exactly
		// the rows THIS statement expired, so each hold is released exactly once (invariant #2).
		// Candidates served by booking_pending_expires_idx (V19, partial).
		return jdbc.sql("""
				UPDATE booking
				SET status = :expired
				WHERE status = :pending AND request_expires_at <= :now
				RETURNING set_id, booking_date
				""")
				.param("expired", BookingStatus.EXPIRED.name())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.param("now", java.sql.Timestamp.from(now))
				.query((rs, rowNum) -> new ClaimRef(new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
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
