package ai.riviera.platform.booking.adapter.out;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;

import javax.sql.DataSource;

import ai.riviera.platform.booking.application.request.RequestSnapshot;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.application.view.DailyBooking;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.application.view.StayRecord;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.application.checkin.CheckInFacts;
import ai.riviera.platform.booking.application.checkin.CompletedCheckIn;
import ai.riviera.platform.booking.application.checkin.DueMove;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.ConfirmedBooking;
import ai.riviera.platform.booking.application.reserve.ConfirmedStay;
import ai.riviera.platform.booking.application.reserve.NewBooking;
import ai.riviera.platform.booking.application.reserve.NewStay;
import ai.riviera.platform.booking.application.refund.RefundableBooking;
import ai.riviera.platform.booking.application.remodel.LiveClaim;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.BookingTransition;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
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

	private static final Logger log = LoggerFactory.getLogger(JdbcBookings.class);

	// Named-parameter keys reused across the lifecycle SQL (keep them in lockstep, no typos).
	private static final String PARAM_STATUS = "status";
	private static final String PARAM_AWAITING = "awaiting";
	private static final String PARAM_PENDING = "pending";
	private static final String PARAM_CONFIRMED = "confirmed";
	private static final String PARAM_COMPLETED = "completed";
	private static final String PARAM_NO_SHOW = "noShow";
	private static final String PARAM_VENUE = "venue";
	private static final String PARAM_REASON = "reason";
	private static final String PARAM_ACCOUNT = "account";
	private static final String PARAM_TODAY = "today";

	// Result-column names reused across the row mappers (keep in lockstep with the SELECT/RETURNING).
	private static final String COL_VENUE_ID = "venue_id";
	private static final String COL_SET_ID = "set_id";
	private static final String COL_BOOKING_DATE = "booking_date";
	private static final String COL_STAY_ID = "stay_id";
	private static final String COL_LAST_DATE = "last_date";
	/**
	 * The rows a guest's code names: a lone booking by its own code, or every stretch of the stay whose
	 * code it is. A stretch's derived row code names nothing (ADR-0024). Each arm reads a unique index.
	 */
	static final String CODE_MATCH =
			"((b.code = :code AND b.stay_id IS NULL) OR b.stay_id = (SELECT id FROM stay WHERE code = :code))";
	private static final String COL_AMOUNT_MINOR = "amount_minor";
	private static final String COL_AMOUNT_CURRENCY = "amount_currency";
	private static final String COL_REQUEST_EXPIRES_AT = "request_expires_at";
	private static final String COL_CUSTOMER_ID = "customer_id";
	private static final String COL_CANCEL_REASON = "cancel_reason";
	private static final String COL_CREATED_AT = "created_at";

	/**
	 * The one outcome rule, shared by check-in and the sweep: mark a due stay's unresolved days
	 * missed, then {@code COMPLETED} if any day was attended, else {@code NO_SHOW}. {@code %s} is the
	 * caller's due-set predicate over {@code booking b}; {@code FOR UPDATE} makes a racing resolve no-op.
	 */
	private static final String RESOLVE_STAY_SQL = """
			WITH due AS (
			    SELECT b.id,
			           EXISTS (SELECT 1 FROM booking_day a
			                   WHERE a.booking_id = b.id AND a.attended_at IS NOT NULL) AS attended
			    FROM booking b
			    WHERE b.status = :confirmed AND %s
			    FOR UPDATE
			), swept AS (
			    UPDATE booking_day n
			    SET missed_at = :at
			    FROM due
			    WHERE n.booking_id = due.id AND n.attended_at IS NULL AND n.missed_at IS NULL
			)
			UPDATE booking b
			SET status       = CASE WHEN due.attended THEN :completed ELSE :noShow END,
			    completed_at = CASE WHEN due.attended THEN CAST(:at AS TIMESTAMPTZ) END
			FROM due
			WHERE b.id = due.id
			""";

	/** Check-in's arm of {@link #RESOLVE_STAY_SQL}: this stay, once no service day after today remains. */
	private static final String RESOLVE_AFTER_CHECK_IN_SQL = RESOLVE_STAY_SQL.formatted("""
			b.id = :id
			      AND NOT EXISTS (SELECT 1 FROM booking_day r
			                      WHERE r.booking_id = b.id AND r.service_date > :date)""");

	/**
	 * The sweep's arm of {@link #RESOLVE_STAY_SQL}: every stay whose last service day has passed,
	 * oldest first, {@code booking_date < :today} letting the partial index narrow the candidates
	 * before the anti-join on the service days.
	 */
	private static final String RESOLVE_DUE_STAYS_SQL = RESOLVE_STAY_SQL.formatted("""
			b.booking_date < :today
			      AND NOT EXISTS (SELECT 1 FROM booking_day r
			                      WHERE r.booking_id = b.id AND r.service_date >= :today)
			    ORDER BY b.booking_date
			    LIMIT :batch""");

	private final JdbcClient jdbc;

	/**
	 * The scheduled sweeps' statements run on the scheduler, never on a request thread, and they
	 * alone use this bounded client. See {@link #boundedClient}.
	 */
	private final JdbcClient sweepJdbc;

	/** Stamps the sweep's missed marks: the sweep has no instant of its own to pass down. */
	private final Clock clock;

	JdbcBookings(JdbcClient jdbc, DataSource dataSource, Clock clock,
			@Value("${riviera.scheduled.query-timeout-seconds}") int scheduledQueryTimeoutSeconds) {
		this.jdbc = jdbc;
		this.clock = clock;
		this.sweepJdbc = boundedClient(dataSource, scheduledQueryTimeoutSeconds);
	}

	/**
	 * A finite-{@code queryTimeout} client for the sweeps only, so a wedged read fails and retries next
	 * tick instead of holding a thread and connection forever. Never widen it to request-path writes
	 * (the claim, #2) nor set the global timeout ({@code ScheduledWorkArchitectureTest}).
	 */
	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		return JdbcClient.create(bounded);
	}

	/**
	 * The nullable account link as a bindable {@code Long}: the signed-in {@link
	 * ai.riviera.platform.customer.vocabulary.CustomerAccountId} value, or {@code null} for a guest
	 * booking (the guest checkout path leaves {@code account_id} NULL).
	 */
	private static Long accountParam(NewBooking b) {
		return b.accountId() == null ? null : b.accountId().value();
	}

	@Override
	public OptionalLong insertAwaitingPayment(NewBooking b) {
		return insert(b, BookingStatus.AWAITING_PAYMENT, null);
	}

	@Override
	public OptionalLong insertPendingRequest(NewBooking b, Instant requestExpiresAt) {
		// Request-to-Book: the deadline is stored on the row so accept guard + expiry sweep share it.
		return insert(b, BookingStatus.PENDING_REQUEST, requestExpiresAt);
	}

	@Override
	public OptionalLong insertStay(NewStay stay) {
		return jdbc.sql("""
				INSERT INTO stay (code, venue_id, first_date, last_date)
				VALUES (:code, :venue, :first, :last)
				ON CONFLICT (code) DO NOTHING
				RETURNING id
				""")
				.param("code", stay.code())
				.param(PARAM_VENUE, stay.venueId().value())
				.param("first", stay.firstDay())
				.param("last", stay.lastDay())
				.query(Long.class)
				.optional()
				.map(OptionalLong::of)
				.orElseGet(OptionalLong::empty);
	}

	/**
	 * The one creation INSERT. {@code ON CONFLICT (code) DO NOTHING} makes a collision an empty
	 * result, not a thrown violation that would poison the caller's transaction; FK/CHECK still throw.
	 * {@code requestExpiresAt} is null on the instant path.
	 */
	private OptionalLong insert(NewBooking b, BookingStatus status, Instant requestExpiresAt) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, request_expires_at, stay_id)
				VALUES (:code, :venue, :set, :customer, :account, :date, :last, :amount, :currency, :status, :expires,
				        :stay)
				ON CONFLICT (code) DO NOTHING
				RETURNING id
				""")
				.param("code", b.code())
				.param("stay", b.stayId() == null ? null : b.stayId().value(), java.sql.Types.BIGINT)
				.param(PARAM_VENUE, b.venueId().value())
				.param("set", b.setId().value())
				.param("customer", b.customerId().value())
				.param(PARAM_ACCOUNT, accountParam(b))
				.param("date", b.bookingDate())
				.param("last", b.lastDate())
				.param("amount", b.amountMinor())
				.param("currency", b.amountCurrency())
				.param(PARAM_STATUS, status.name())
				.param("expires", requestExpiresAt == null ? null : java.sql.Timestamp.from(requestExpiresAt),
						java.sql.Types.TIMESTAMP)
				.query(Long.class)
				.optional()
				.map(OptionalLong::of)
				.orElseGet(OptionalLong::empty);
	}

	@Override
	public Optional<ai.riviera.platform.booking.application.request.AcceptedRequest> acceptPendingRequest(
			long bookingId, VenueId venueId, Instant now) {
		// Guarded venue-scoped accept; accepted_at is read back so the payment-due deadline anchors to it.
		return jdbc.sql("""
				UPDATE booking
				SET status = :awaiting, accepted_at = :now
				WHERE id = :id AND venue_id = :venue AND status = :pending
				  AND request_expires_at > :now
				RETURNING id, venue_id, set_id, booking_date, last_date, accepted_at, created_at,
				          amount_minor, amount_currency
				""")
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.param("now", java.sql.Timestamp.from(now))
				.param("id", bookingId)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new ai.riviera.platform.booking.application.request.AcceptedRequest(
						rs.getLong("id"), new VenueId(rs.getLong(COL_VENUE_ID)),
						new SetId(rs.getLong(COL_SET_ID)), rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						rs.getObject(COL_LAST_DATE, LocalDate.class), rs.getTimestamp("accepted_at").toInstant(),
						rs.getTimestamp(COL_CREATED_AT).toInstant(), rs.getLong(COL_AMOUNT_MINOR),
						rs.getString(COL_AMOUNT_CURRENCY)))
				.optional();
	}

	@Override
	public Optional<ClaimRef> findPendingRequestSpan(long bookingId, VenueId venueId) {
		return jdbc.sql("""
				SELECT set_id, booking_date, last_date
				FROM booking
				WHERE id = :id AND venue_id = :venue AND status = :pending
				""")
				.param("id", bookingId)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query(JdbcBookings::mapClaimRef)
				.optional();
	}

	@Override
	public List<ai.riviera.platform.booking.application.request.DeclinedRival> declineOverlappingPending(
			SetId setId, LocalDate firstDay, LocalDate lastDay, long exceptBookingId, DeclineReason reason) {
		return jdbc.sql("""
				UPDATE booking
				SET status = :declined, decline_reason = :reason
				WHERE set_id = :set AND status = :pending AND id <> :except
				  AND booking_date <= :last AND last_date >= :first
				RETURNING id, set_id, booking_date
				""")
				.param("declined", BookingStatus.DECLINED.name())
				.param(PARAM_REASON, reason.name())
				.param("set", setId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.param("except", exceptBookingId)
				.param("first", firstDay)
				.param("last", lastDay)
				.query((rs, rowNum) -> new ai.riviera.platform.booking.application.request.DeclinedRival(
						rs.getLong("id"), new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
				.list();
	}

	@Override
	public boolean revertAcceptToPending(long bookingId) {
		// Compensation for a failed payment-request issuance. No REGISTERED PaymentIntent exists
		// (a double-timeout residual at Stripe stays unregistered and inert — webhooks correlate
		// via the payment table), so no webhook can race this back-transition. Restores the
		// original deadline by leaving request_expires_at as-is.
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
	public Optional<ClaimRef> declinePending(long bookingId, VenueId venueId, DeclineReason reason) {
		// Venue-scoped and guarded; RETURNING the set and span iff it transitioned (contract: the port).
		return jdbc.sql("""
				UPDATE booking
				SET status = :declined, decline_reason = :reason
				WHERE id = :id AND venue_id = :venue AND status = :pending
				RETURNING set_id, booking_date, last_date
				""")
				.param("declined", BookingStatus.DECLINED.name())
				.param(PARAM_REASON, reason.name())
				.param("id", bookingId)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query(JdbcBookings::mapClaimRef)
				.optional();
	}

	@Override
	public Optional<ai.riviera.platform.booking.application.request.WithdrawnRequest>
			withdrawPendingRequest(String code) {
		// One statement is the whole decision — no read-then-write window (contract: the port).
		return jdbc.sql("""
				UPDATE booking
				SET status = :withdrawn
				WHERE code = :code AND status = :pending
				RETURNING id, set_id, booking_date, last_date
				""")
				.param("withdrawn", BookingStatus.WITHDRAWN.name())
				.param("code", code)
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new ai.riviera.platform.booking.application.request.WithdrawnRequest(
						rs.getLong("id"), new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class), rs.getObject(COL_LAST_DATE, LocalDate.class)))
				.optional();
	}

	@Override
	public Optional<RequestSnapshot> requestSnapshot(
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
					java.sql.Timestamp expires = rs.getTimestamp(COL_REQUEST_EXPIRES_AT);
					return new ai.riviera.platform.booking.application.request.RequestSnapshot(
							BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
							expires == null ? null : expires.toInstant());
				})
				.optional();
	}

	@Override
	public List<ai.riviera.platform.booking.application.request.PendingRequestRow> findPendingRequestsForVenue(
			VenueId venueId) {
		// Operator queue: pending requests, most urgent deadline first. Deliberately
		// does NOT select the code (invariant #7 — the operator acts by id). Served by
		// booking_venue_id_idx; the PENDING_REQUEST slice per venue is tiny.
		return jdbc.sql("""
				SELECT b.id, b.set_id, b.booking_date, b.last_date, b.customer_id, b.amount_minor,
				       b.amount_currency, b.created_at, b.request_expires_at,
				       (SELECT COUNT(*) FROM booking o
				        WHERE o.set_id = b.set_id AND o.status = :pending AND o.id <> b.id
				          AND o.booking_date <= b.last_date AND o.last_date >= b.booking_date) AS competing_requests
				FROM booking b
				WHERE b.venue_id = :venue AND b.status = :pending
				ORDER BY b.request_expires_at, b.id
				""")
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new ai.riviera.platform.booking.application.request.PendingRequestRow(
						rs.getLong("id"), new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class), rs.getObject(COL_LAST_DATE, LocalDate.class),
						new ai.riviera.platform.customer.vocabulary.CustomerId(rs.getLong(COL_CUSTOMER_ID)),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
						rs.getTimestamp(COL_CREATED_AT).toInstant(),
						rs.getTimestamp(COL_REQUEST_EXPIRES_AT).toInstant(),
						rs.getInt("competing_requests")))
				.list();
	}

	@Override
	public Optional<BookingRecord> findByCode(String code) {
		return jdbc.sql("""
				SELECT b.id, b.code, b.status, b.venue_id, b.set_id, b.customer_id,
				       b.booking_date, b.last_date, b.amount_minor, b.amount_currency, b.cancelled_at, b.refund_minor,
				       b.request_expires_at, b.cancel_reason, b.created_at, b.accepted_at, b.moved_at, b.decline_reason
				FROM booking b
				WHERE b.code = :code AND b.stay_id IS NULL
				""")
				.param("code", code)
				.query(JdbcBookings::mapBookingRecord)
				.optional();
	}

	@Override
	public Optional<StayRecord> findStayByCode(String code) {
		return jdbc.sql("SELECT id, code, venue_id, first_date, last_date FROM stay WHERE code = :code")
				.param("code", code)
				.query((rs, rowNum) -> new StayRecord(new StayId(rs.getLong("id")), rs.getString("code"),
						new VenueId(rs.getLong(COL_VENUE_ID)), rs.getObject("first_date", LocalDate.class),
						rs.getObject(COL_LAST_DATE, LocalDate.class), List.of()))
				.optional()
				.map(stay -> new StayRecord(stay.id(), stay.code(), stay.venueId(), stay.firstDay(), stay.lastDay(),
						stretchesOf(stay.id())));
	}

	@Override
	public List<BookingRecord> lockStretches(StayId stayId) {
		return stretchesOf(stayId, "FOR UPDATE OF b");
	}

	private List<BookingRecord> stretchesOf(StayId stayId) {
		return stretchesOf(stayId, "");
	}

	private List<BookingRecord> stretchesOf(StayId stayId, String locking) {
		return jdbc.sql("""
				SELECT b.id, s.code, b.status, b.venue_id, b.set_id, b.customer_id,
				       b.booking_date, b.last_date, b.amount_minor, b.amount_currency, b.cancelled_at, b.refund_minor,
				       b.request_expires_at, b.cancel_reason, b.created_at, b.accepted_at, b.moved_at, b.decline_reason
				FROM booking b
				JOIN stay s ON s.id = b.stay_id
				WHERE b.stay_id = :stay
				ORDER BY b.booking_date
				%s
				""".formatted(locking))
				.param("stay", stayId.value())
				.query(JdbcBookings::mapBookingRecord)
				.list();
	}

	@Override
	public List<BookingRecord> findByAccountId(CustomerAccountId accountId) {
		// The signed-in customer's bookings, newest first — account-scoped by account_id
		// (the session principal's id, never a request param). Served by booking_account_id_idx (V26,
		// partial on the non-NULL slice). Same row shape as findByCode so MyBookingsService enriches
		// uniformly; a guest booking (NULL account_id) can never match.
		List<AccountRow> rows = jdbc.sql("""
				SELECT b.id, COALESCE(s.code, b.code) AS code, b.status, b.venue_id, b.set_id, b.customer_id,
				       b.booking_date, b.last_date, b.amount_minor, b.amount_currency, b.cancelled_at, b.refund_minor,
				       b.request_expires_at, b.cancel_reason, b.created_at, b.accepted_at, b.moved_at, b.decline_reason,
				       s.id AS stay_id, s.first_date AS stay_first_date, s.last_date AS stay_last_date
				FROM booking b
				LEFT JOIN stay s ON s.id = b.stay_id
				WHERE b.account_id = :account
				ORDER BY b.booking_date DESC, b.id DESC
				""")
				.param(PARAM_ACCOUNT, accountId.value())
				.query((rs, rowNum) -> new AccountRow(mapBookingRecord(rs, rowNum), rs.getObject(COL_STAY_ID, Long.class),
						rs.getObject("stay_first_date", LocalDate.class), rs.getObject("stay_last_date", LocalDate.class)))
				.list();
		return groupedByStay(rows);
	}

	/** A stitched stay lists once, as one booking (ADR-0024), where its latest stretch fell; a lone booking as itself. */
	private static List<BookingRecord> groupedByStay(List<AccountRow> rows) {
		List<BookingRecord> listed = new ArrayList<>();
		Map<Long, Integer> slotOfStay = new HashMap<>();
		Map<Long, AccountRow> stayOf = new HashMap<>();
		Map<Long, List<BookingRecord>> stretchesOfStay = new HashMap<>();
		for (AccountRow row : rows) {
			if (row.stayId() == null) {
				listed.add(row.booking());
			}
			else {
				if (slotOfStay.putIfAbsent(row.stayId(), listed.size()) == null) {
					listed.add(row.booking());
					stayOf.put(row.stayId(), row);
				}
				stretchesOfStay.computeIfAbsent(row.stayId(), id -> new ArrayList<>()).add(row.booking());
			}
		}
		slotOfStay.forEach((stayId, slot) -> {
			AccountRow stay = stayOf.get(stayId);
			listed.set(slot, new StayRecord(new StayId(stayId), stay.booking().code(), stay.booking().venueId(),
					stay.stayFirstDate(), stay.stayLastDate(), stretchesOfStay.get(stayId).reversed()).asBooking());
		});
		return listed;
	}

	private record AccountRow(BookingRecord booking, Long stayId, LocalDate stayFirstDate, LocalDate stayLastDate) {
	}

	/** Shared {@link BookingRecord} row mapper for the by-code + by-account reads. */
	private static BookingRecord mapBookingRecord(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
		java.sql.Timestamp cancelledAt = rs.getTimestamp("cancelled_at");
		Long refundMinor = rs.getObject("refund_minor", Long.class);
		java.sql.Timestamp requestExpiresAt = rs.getTimestamp(COL_REQUEST_EXPIRES_AT);
		String cancelReason = rs.getString(COL_CANCEL_REASON);
		java.sql.Timestamp acceptedAt = rs.getTimestamp("accepted_at");
		java.sql.Timestamp movedAt = rs.getTimestamp("moved_at");
		String declineReason = rs.getString("decline_reason");
		return new BookingRecord(
				rs.getLong("id"), rs.getString("code"),
				BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
				new VenueId(rs.getLong(COL_VENUE_ID)), new SetId(rs.getLong(COL_SET_ID)),
				new ai.riviera.platform.customer.vocabulary.CustomerId(rs.getLong(COL_CUSTOMER_ID)),
				rs.getObject(COL_BOOKING_DATE, LocalDate.class), rs.getObject(COL_LAST_DATE, LocalDate.class),
				rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
				cancelledAt == null ? null : cancelledAt.toInstant(), refundMinor,
				requestExpiresAt == null ? null : requestExpiresAt.toInstant(),
				refundReasonOf(cancelReason), rs.getTimestamp(COL_CREATED_AT).toInstant(),
				acceptedAt == null ? null : acceptedAt.toInstant(),
				movedAt == null ? null : movedAt.toInstant(),
				declineReason == null ? null : DeclineReason.valueOf(declineReason));
	}

	/**
	 * The {@code cancel_reason} as a {@link RefundReason}, or {@code null} when absent <em>or</em>
	 * unknown to this build — keep it tolerant: a token added to the CHECK ahead of the enum would
	 * otherwise fail every row of {@code GET /api/me/bookings}.
	 */
	private static RefundReason refundReasonOf(String token) {
		if (token == null) {
			return null;
		}
		try {
			return RefundReason.valueOf(token);
		}
		catch (IllegalArgumentException unknownToken) {
			log.warn("ignoring unknown booking.cancel_reason token '{}' — treating it as no reason", token);
			return null;
		}
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
				RETURNING id, venue_id, set_id, booking_date, last_date, created_at, amount_minor, amount_currency,
				          stay_id
				""")
				.param(PARAM_STATUS, BookingStatus.CONFIRMED.name())
				.param("at", java.sql.Timestamp.from(confirmedAt))
				.param("id", bookingId)
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.query((rs, rowNum) -> new ConfirmedBooking(
						rs.getLong("id"), new VenueId(rs.getLong(COL_VENUE_ID)),
						new SetId(rs.getLong(COL_SET_ID)), rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						rs.getObject(COL_LAST_DATE, LocalDate.class),
						rs.getTimestamp(COL_CREATED_AT).toInstant(),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
						Optional.ofNullable(rs.getObject(COL_STAY_ID, Long.class)).map(StayId::new).orElse(null)))
				.optional();
	}

	@Override
	public Optional<ConfirmedStay> lockConfirmedStay(StayId stayId) {
		// Lock first: the count then runs on a fresh READ COMMITTED snapshot seeing every earlier sibling confirm.
		jdbc.sql("SELECT id FROM stay WHERE id = :stay FOR UPDATE").param("stay", stayId.value())
				.query(Long.class).single();
		return jdbc.sql("""
				SELECT set_id, booking_date, created_at FROM booking
				WHERE stay_id = :stay
				  AND NOT EXISTS (SELECT 1 FROM booking u WHERE u.stay_id = :stay AND u.confirmed_at IS NULL)
				ORDER BY booking_date
				LIMIT 1
				""")
				.param("stay", stayId.value())
				.query((rs, rowNum) -> new ConfirmedStay(stayId, new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class), rs.getTimestamp(COL_CREATED_AT).toInstant()))
				.optional();
	}

	@Override
	public Optional<CancelledBooking> cancelConfirmed(long bookingId, Instant cancelledAt,
			long refundMinor, RefundReason reason) {
		return cancelReturningFacts(bookingId, cancelledAt, refundMinor, reason,
				BookingTransition.CANCEL_BY_GUEST.admittedFrom());
	}

	@Override
	public boolean moveToSet(long bookingId, SetId from, SetId to, Instant movedAt) {
		return jdbc.sql("""
				UPDATE booking
				SET set_id = :to, moved_at = :at
				WHERE id = :id AND set_id = :from AND status IN (:live)
				""")
				.param("to", to.value())
				.param("at", java.sql.Timestamp.from(movedAt))
				.param("id", bookingId)
				.param("from", from.value())
				.param("live", JdbcBookingPresence.LIVE_STATUSES)
				.update() == 1;
	}

	@Override
	public Optional<CancelledBooking> cancelForWeather(long bookingId, Instant cancelledAt,
			long refundMinor) {
		// Admits NO_SHOW too: the sweep gets to a washed-out day before the operator does.
		return cancelReturningFacts(bookingId, cancelledAt, refundMinor, RefundReason.WEATHER,
				BookingTransition.WEATHER_REFUND.admittedFrom());
	}

	/**
	 * The one cancellation write for both entry points, guarded on {@code admitted} (from {@link
	 * BookingTransition}): a double-cancel or a status outside it is an {@code empty} no-op, so the
	 * release, refund and event fire exactly once; {@code reason} is the audit of why (#10).
	 */
	private Optional<CancelledBooking> cancelReturningFacts(long bookingId, Instant cancelledAt,
			long refundMinor, RefundReason reason, Set<BookingStatus> admitted) {
		return jdbc.sql("""
				UPDATE booking
				SET status = :cancelled, cancelled_at = :at, refund_minor = :refund, cancel_reason = :reason
				WHERE id = :id AND status = ANY (:admitted)
				RETURNING id, venue_id, set_id, booking_date, last_date, amount_minor, amount_currency
				""")
				.param("cancelled", BookingStatus.CANCELLED.name())
				.param("at", java.sql.Timestamp.from(cancelledAt))
				.param("refund", refundMinor)
				.param(PARAM_REASON, reason.name())
				.param("id", bookingId)
				.param("admitted", admitted.stream().map(BookingStatus::name).toArray(String[]::new))
				.query((rs, rowNum) -> new CancelledBooking(
						rs.getLong("id"), new VenueId(rs.getLong(COL_VENUE_ID)),
						new SetId(rs.getLong(COL_SET_ID)), rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						rs.getObject(COL_LAST_DATE, LocalDate.class),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY)))
				.optional();
	}

	/**
	 * The guarded stamp on today's row, then {@link #RESOLVE_STAY_SQL} when no later day remains; a
	 * miss skips the resolve. Lock order is a rule: today's stretch's booking row alone ({@code FOR UPDATE}),
	 * today's day, then earlier days — the sweep's order (RESPONSIBILITIES.md §booking), so the two never deadlock.
	 */
	@Override
	public Optional<CompletedCheckIn> completeConfirmed(String code, VenueId venueId,
			LocalDate serviceDate, Instant completedAt) {
		Optional<CompletedCheckIn> attended = jdbc.sql("""
				WITH today AS (
				    SELECT b.id, b.set_id, b.booking_date
				    FROM booking b
				    WHERE %s AND b.venue_id = :venue AND b.status = :confirmed
				      AND EXISTS (SELECT 1 FROM booking_day d WHERE d.booking_id = b.id AND d.service_date = :date)
				    FOR UPDATE OF b
				)
				UPDATE booking_day n
				SET attended_at = :at
				FROM today
				WHERE n.booking_id = today.id AND n.service_date = :date
				  AND n.attended_at IS NULL AND n.missed_at IS NULL
				RETURNING today.id, today.set_id, today.booking_date
				""".formatted(CODE_MATCH))
				.param("at", java.sql.Timestamp.from(completedAt))
				.param("code", code)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param("date", serviceDate)
				.query((rs, rowNum) -> new CompletedCheckIn(
						rs.getLong("id"), new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
				.optional();
		attended.ifPresent(done -> resolveStayOf(done.bookingId(), serviceDate, completedAt));
		return attended;
	}

	private void resolveStayOf(long bookingId, LocalDate today, Instant resolvedAt) {
		jdbc.sql(RESOLVE_AFTER_CHECK_IN_SQL)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param(PARAM_COMPLETED, BookingStatus.COMPLETED.name())
				.param(PARAM_NO_SHOW, BookingStatus.NO_SHOW.name())
				.param("id", bookingId)
				.param("date", today)
				.param("at", java.sql.Timestamp.from(resolvedAt))
				.update();
	}

	/**
	 * Bounded ({@code sweepJdbc}), batched by stays in {@code booking_date} (sweep-index) order. Booking
	 * row {@code FOR UPDATE} before its days, as check-in; never {@code SKIP LOCKED} — a short batch
	 * reads as drained and would strand the contended row (RESPONSIBILITIES.md §booking).
	 */
	@Override
	public int markPastServiceDaysMissed(LocalDate today, int batchSize) {
		return sweepJdbc.sql("""
				WITH due AS (
				    SELECT b.id
				    FROM booking b
				    WHERE b.status = :confirmed AND b.booking_date < :today
				      AND EXISTS (SELECT 1 FROM booking_day u
				                  WHERE u.booking_id = b.id AND u.service_date < :today
				                    AND u.attended_at IS NULL AND u.missed_at IS NULL)
				    ORDER BY b.booking_date
				    LIMIT :batch
				    FOR UPDATE
				)
				UPDATE booking_day n
				SET missed_at = :at
				FROM due
				WHERE n.booking_id = due.id AND n.service_date < :today
				  AND n.attended_at IS NULL AND n.missed_at IS NULL
				""")
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param(PARAM_TODAY, today)
				.param("batch", batchSize)
				.param("at", java.sql.Timestamp.from(clock.instant()))
				.update();
	}

	/**
	 * On {@code sweepJdbc}, like {@link #markPastServiceDaysMissed}, under the same {@code FOR
	 * UPDATE} discipline and the same order. The resolve is {@link #RESOLVE_DUE_STAYS_SQL}.
	 */
	@Override
	public int markPastConfirmedAsNoShow(LocalDate today, int batchSize) {
		return sweepJdbc.sql(RESOLVE_DUE_STAYS_SQL)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param(PARAM_COMPLETED, BookingStatus.COMPLETED.name())
				.param(PARAM_NO_SHOW, BookingStatus.NO_SHOW.name())
				.param(PARAM_TODAY, today)
				.param("batch", batchSize)
				.param("at", java.sql.Timestamp.from(clock.instant()))
				.update();
	}

	@Override
	public List<BookingId> findStayMovesDue(LocalDate moveDay) {
		// Sweep entry read, so the bounded client; served by booking_move_reminder_due_idx (V66).
		return sweepJdbc.sql("""
				SELECT t.id
				FROM booking t
				JOIN booking p ON p.stay_id = t.stay_id AND p.id <> t.id AND p.last_date = :dayBefore
				WHERE t.stay_id IS NOT NULL AND t.booking_date = :moveDay AND t.status = :confirmed
				  AND t.move_reminder_at IS NULL AND t.set_id <> p.set_id
				  AND p.status IN (:confirmed, :completed)
				ORDER BY t.id
				""")
				.param("moveDay", moveDay)
				.param("dayBefore", moveDay.minusDays(1))
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param(PARAM_COMPLETED, BookingStatus.COMPLETED.name())
				.query((rs, rowNum) -> new BookingId(rs.getLong("id")))
				.list();
	}

	@Override
	public Optional<DueMove> stampMoveReminder(long bookingId, Instant at) {
		return jdbc.sql("""
				UPDATE booking
				SET move_reminder_at = :at
				WHERE id = :id AND status = :confirmed AND move_reminder_at IS NULL
				RETURNING stay_id, booking_date
				""")
				.param("at", java.sql.Timestamp.from(at))
				.param("id", bookingId)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.query((rs, rowNum) -> new DueMove(new StayId(rs.getLong(COL_STAY_ID)), new BookingId(bookingId),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
				.optional();
	}

	@Override
	public Optional<CheckInFacts> findCheckInFacts(String code, VenueId venueId, LocalDate today) {
		// Venue-scoped on purpose: a foreign venue's code reads as empty, same as an unknown one.
		return jdbc.sql("""
				SELECT b.status, b.booking_date, b.set_id, n.attended_at IS NOT NULL AS attended_today
				FROM booking b
				LEFT JOIN booking_day n ON n.booking_id = b.id AND n.service_date = :today
				WHERE %s AND b.venue_id = :venue
				ORDER BY (:today BETWEEN b.booking_date AND b.last_date) DESC, (b.booking_date > :today) DESC,
				         abs(b.booking_date - :today) ASC
				LIMIT 1
				""".formatted(CODE_MATCH))
				.param("code", code)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_TODAY, today)
				.query((rs, rowNum) -> new CheckInFacts(
						BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						new SetId(rs.getLong(COL_SET_ID)),
						rs.getBoolean("attended_today")))
				.optional();
	}

	/**
	 * Staff daily view: settled bookings covering one day, by set, served by {@code
	 * booking_venue_id_idx}. The code is selected for staff verification (invariant #7) — returned
	 * to the operator-gated caller, never logged here.
	 */
	@Override
	public List<DailyBooking> findSettledForVenueOn(VenueId venueId, LocalDate date) {
		return jdbc.sql("""
				SELECT b.set_id, COALESCE(s.code, b.code) AS code, b.status
				FROM booking b
				LEFT JOIN stay s ON s.id = b.stay_id
				WHERE b.venue_id = :venue AND b.booking_date <= :date AND b.last_date >= :date
				  AND status IN (:confirmed, :completed, :noShow)
				ORDER BY set_id
				""")
				.param(PARAM_VENUE, venueId.value())
				.param("date", date)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param(PARAM_COMPLETED, BookingStatus.COMPLETED.name())
				.param(PARAM_NO_SHOW, BookingStatus.NO_SHOW.name())
				.query((rs, rowNum) -> new DailyBooking(
						new SetId(rs.getLong(COL_SET_ID)), rs.getString("code"),
						BookingStatus.valueOf(rs.getString(PARAM_STATUS))))
				.list();
	}

	/**
	 * Weather refund candidates covering the date, served by {@code booking_venue_id_idx}; a stay is
	 * selected too, its span telling it from a one-day booking. The amount is the FULL refund the
	 * caller stamps on a one-day booking via {@link #cancelForWeather}.
	 */
	@Override
	public List<RefundableBooking> findRefundableForWeather(VenueId venueId, LocalDate date) {
		return jdbc.sql("""
				SELECT id, amount_minor, booking_date, last_date
				FROM booking
				WHERE venue_id = :venue AND booking_date <= :date AND last_date >= :date
				  AND status IN (:confirmed, :noShow)
				ORDER BY id
				""")
				.param(PARAM_VENUE, venueId.value())
				.param("date", date)
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param(PARAM_NO_SHOW, BookingStatus.NO_SHOW.name())
				.query((rs, rowNum) -> new RefundableBooking(
						rs.getLong("id"), rs.getLong(COL_AMOUNT_MINOR),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class), rs.getObject(COL_LAST_DATE, LocalDate.class)))
				.list();
	}

	@Override
	public List<BookingId> findExpirableAwaitingPayment(Instant createdBefore, Instant acceptedBefore,
			LocalDate serviceDayEndedOnOrBefore) {
		// Abandoned-payment sweep candidates, two clocks: an instant booking
		// (accepted_at IS NULL) expires on the creation clock — served by
		// booking_awaiting_created_idx (V13); an accepted request expires on the accept clock —
		// served by booking_awaiting_accepted_idx (V19). Never the other way around: an accepted
		// request judged by created_at would be swept the moment it was accepted.
		// sweepJdbc, not jdbc: this read opens a scheduled run and is bounded.
		return sweepJdbc.sql("""
				SELECT id
				FROM booking
				WHERE status = :awaiting
				  -- SQL mirror of RequestWindows#payDeadline; identity pinned by RequestWindowsTest
				  AND (   booking_date <= :serviceDayEndedOnOrBefore
				       OR (accepted_at IS NULL AND created_at < :createdBefore)
				       OR (accepted_at IS NOT NULL AND accepted_at < :acceptedBefore))
				ORDER BY id
				""")
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.param("createdBefore", java.sql.Timestamp.from(createdBefore))
				.param("acceptedBefore", java.sql.Timestamp.from(acceptedBefore))
				.param("serviceDayEndedOnOrBefore", serviceDayEndedOnOrBefore)
				.query((rs, rowNum) -> new BookingId(rs.getLong("id")))
				.list();
	}

	@Override
	public List<BookingId> findOverduePendingRequests(Instant now) {
		// Request-expiry sweep candidates, served by booking_pending_expires_idx
		// (V19, partial). Ids only — each is then expired via the guarded per-row transition.
		// sweepJdbc, not jdbc: this read opens a scheduled run and is bounded.
		return sweepJdbc.sql("""
				SELECT id
				FROM booking
				WHERE status = :pending AND request_expires_at <= :now
				ORDER BY id
				""")
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.param("now", java.sql.Timestamp.from(now))
				.query((rs, rowNum) -> new BookingId(rs.getLong("id")))
				.list();
	}

	@Override
	public Optional<ClaimRef> expirePendingRequest(long bookingId, Instant now) {
		// Guarded per row; RETURNING the set and span iff THIS statement transitioned it (contract: the port).
		return jdbc.sql("""
				UPDATE booking
				SET status = :expired
				WHERE id = :id AND status = :pending AND request_expires_at <= :now
				RETURNING set_id, booking_date, last_date
				""")
				.param("expired", BookingStatus.EXPIRED.name())
				.param("id", bookingId)
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.param("now", java.sql.Timestamp.from(now))
				.query(JdbcBookings::mapClaimRef)
				.optional();
	}

	@Override
	public Optional<ClaimRef> cancelAwaitingPayment(long bookingId) {
		// Guarded; RETURNING the set and span iff a row transitioned, else empty and nothing to release.
		return jdbc.sql("""
				UPDATE booking
				SET status = :cancelled
				WHERE id = :id AND status = :awaiting
				RETURNING set_id, booking_date, last_date
				""")
				.param("cancelled", BookingStatus.CANCELLED.name())
				.param("id", bookingId)
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.query(JdbcBookings::mapClaimRef)
				.optional();
	}

	/** The set and span every releasing transition {@code RETURNING}s: one row to free per day. */
	private static ClaimRef mapClaimRef(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
		return new ClaimRef(new SetId(rs.getLong(COL_SET_ID)), rs.getObject(COL_BOOKING_DATE, LocalDate.class),
				rs.getObject(COL_LAST_DATE, LocalDate.class));
	}

	/** The same live filter as {@code JdbcBookingPresence}; {@code booking_set_date_idx} serves the set list. */
	@Override
	public List<LiveClaim> findLiveOnSets(Collection<SetId> setIds) {
		if (setIds.isEmpty()) {
			return List.of();
		}
		return jdbc.sql("""
				SELECT id, set_id, booking_date, last_date, status, amount_minor, amount_currency
				FROM booking
				WHERE set_id IN (:ids) AND status IN (:live)
				ORDER BY booking_date, id
				""")
				.param("ids", setIds.stream().map(SetId::value).toList())
				.param("live", JdbcBookingPresence.LIVE_STATUSES)
				.query((rs, rowNum) -> new LiveClaim(rs.getLong("id"), new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class), rs.getObject(COL_LAST_DATE, LocalDate.class),
						BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY)))
				.list();
	}
}
