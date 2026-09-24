package ai.riviera.platform.booking.adapter.out;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
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
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.application.view.DailyBooking;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.application.checkin.CheckInFacts;
import ai.riviera.platform.booking.application.checkin.CompletedCheckIn;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.ConfirmedBooking;
import ai.riviera.platform.booking.application.reserve.NewBooking;
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
	private static final String PARAM_ACCOUNT = "account";
	private static final String PARAM_TODAY = "today";

	// Result-column names reused across the row mappers (keep in lockstep with the SELECT/RETURNING).
	private static final String COL_VENUE_ID = "venue_id";
	private static final String COL_SET_ID = "set_id";
	private static final String COL_BOOKING_DATE = "booking_date";
	private static final String COL_LAST_DATE = "last_date";
	private static final String COL_AMOUNT_MINOR = "amount_minor";
	private static final String COL_AMOUNT_CURRENCY = "amount_currency";
	private static final String COL_REQUEST_EXPIRES_AT = "request_expires_at";
	private static final String COL_CUSTOMER_ID = "customer_id";
	private static final String COL_CANCEL_REASON = "cancel_reason";
	private static final String COL_CREATED_AT = "created_at";

	/**
	 * The one resolve statement, shared by check-in and the sweep so the outcome rule is written
	 * once: a due stay's still-unresolved service days are marked missed, then its status becomes
	 * {@code COMPLETED} if any service day was attended and {@code NO_SHOW} otherwise, {@code
	 * completed_at} stamped only with {@code COMPLETED}. {@code %s} is the caller's due-set
	 * predicate over {@code booking b}; the {@code FOR UPDATE} makes a concurrent resolve wait and
	 * then match nothing.
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
	 * A {@link JdbcClient} of this adapter's own with a finite {@code queryTimeout}, used by the
	 * abandoned-payment, request-expiry and no-show sweeps and by nothing else — the
	 * {@code JdbcEmailSuppressions#boundedClient} idiom applied to scheduled work.
	 *
	 * <p>Postgres's default statement timeout is infinite, so a wedged candidate read — a migration
	 * holding {@code ACCESS EXCLUSIVE} on {@code booking} during a rolling deploy is the realistic
	 * one — has no natural end. An unbounded sweep that never returns keeps its thread and its
	 * pooled connection forever, and the abandoned-payment sweep going silent means expired
	 * bookings keep their {@code (set, date)} claims: sets that stay unsellable, in the safe
	 * direction, with no alarm. Bounded, the run fails, is logged, and the next tick five minutes
	 * later retries — every sweep is idempotent and its per-row transitions are guarded, so a lost
	 * run costs nothing.
	 *
	 * <p><strong>Why the sweeps and not this whole adapter.</strong> The rest of {@code Bookings}
	 * is the request path, including the guarded {@code UPDATE … RETURNING} that releases a claim.
	 * Those writes take row locks on {@code set_availability}, invariant #2's table, and bounding
	 * them would be the reach #395 exists to avoid — the timeout stops at the reads that open a
	 * scheduled run. For the same reason this is not {@code spring.jdbc.template.query-timeout},
	 * which would bound every statement in the application including the claim itself; {@code
	 * ScheduledWorkArchitectureTest} fails the build if that global is ever set.
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

	/**
	 * The one creation INSERT both entry statuses share. {@code ON CONFLICT (code) DO NOTHING}
	 * makes a code collision a no-op (empty result), NOT a thrown unique violation — so the
	 * caller's regenerate-and-retry works WITHOUT aborting the surrounding transaction (a thrown
	 * violation would poison it). FK/CHECK failures still throw, as they should. RETURNING yields
	 * the id only on a real insert. {@code request_expires_at} binds NULL on the instant path —
	 * only a pending request stores a deadline. {@code last_date} is bound to the same day: a reserve
	 * is still one service day.
	 */
	private OptionalLong insert(NewBooking b, BookingStatus status, Instant requestExpiresAt) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :customer, :account, :date, :date, :amount, :currency, :status, :expires)
				ON CONFLICT (code) DO NOTHING
				RETURNING id
				""")
				.param("code", b.code())
				.param(PARAM_VENUE, b.venueId().value())
				.param("set", b.setId().value())
				.param("customer", b.customerId().value())
				.param(PARAM_ACCOUNT, accountParam(b))
				.param("date", b.bookingDate())
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
				RETURNING id, venue_id, set_id, booking_date, accepted_at, created_at,
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
						rs.getTimestamp("accepted_at").toInstant(),
						rs.getTimestamp(COL_CREATED_AT).toInstant(), rs.getLong(COL_AMOUNT_MINOR),
						rs.getString(COL_AMOUNT_CURRENCY)))
				.optional();
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
	public Optional<ClaimRef> declinePending(long bookingId, VenueId venueId) {
		// Guarded venue-scoped decline: RETURNING the (set, date) iff it transitioned, so the
		// caller releases the soft-hold exactly once (invariant #2). No deadline guard — see port.
		return jdbc.sql("""
				UPDATE booking
				SET status = :declined
				WHERE id = :id AND venue_id = :venue AND status = :pending
				RETURNING set_id, booking_date, last_date
				""")
				.param("declined", BookingStatus.DECLINED.name())
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
						new ai.riviera.platform.customer.vocabulary.CustomerId(rs.getLong(COL_CUSTOMER_ID)),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
						rs.getTimestamp(COL_CREATED_AT).toInstant(),
						rs.getTimestamp(COL_REQUEST_EXPIRES_AT).toInstant()))
				.list();
	}

	@Override
	public Optional<BookingRecord> findByCode(String code) {
		return jdbc.sql("""
				SELECT id, code, status, venue_id, set_id, customer_id, booking_date,
				       amount_minor, amount_currency, cancelled_at, refund_minor, request_expires_at,
				       cancel_reason, created_at, accepted_at, moved_at
				FROM booking
				WHERE code = :code
				""")
				.param("code", code)
				.query(JdbcBookings::mapBookingRecord)
				.optional();
	}

	@Override
	public List<BookingRecord> findByAccountId(CustomerAccountId accountId) {
		// The signed-in customer's bookings, newest first — account-scoped by account_id
		// (the session principal's id, never a request param). Served by booking_account_id_idx (V26,
		// partial on the non-NULL slice). Same row shape as findByCode so MyBookingsService enriches
		// uniformly; a guest booking (NULL account_id) can never match.
		return jdbc.sql("""
				SELECT id, code, status, venue_id, set_id, customer_id, booking_date,
				       amount_minor, amount_currency, cancelled_at, refund_minor, request_expires_at,
				       cancel_reason, created_at, accepted_at, moved_at
				FROM booking
				WHERE account_id = :account
				ORDER BY booking_date DESC, id DESC
				""")
				.param(PARAM_ACCOUNT, accountId.value())
				.query(JdbcBookings::mapBookingRecord)
				.list();
	}

	/** Shared {@link BookingRecord} row mapper for the by-code + by-account reads. */
	private static BookingRecord mapBookingRecord(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
		java.sql.Timestamp cancelledAt = rs.getTimestamp("cancelled_at");
		Long refundMinor = rs.getObject("refund_minor", Long.class);
		java.sql.Timestamp requestExpiresAt = rs.getTimestamp(COL_REQUEST_EXPIRES_AT);
		String cancelReason = rs.getString(COL_CANCEL_REASON);
		java.sql.Timestamp acceptedAt = rs.getTimestamp("accepted_at");
		java.sql.Timestamp movedAt = rs.getTimestamp("moved_at");
		return new BookingRecord(
				rs.getLong("id"), rs.getString("code"),
				BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
				new VenueId(rs.getLong(COL_VENUE_ID)), new SetId(rs.getLong(COL_SET_ID)),
				new ai.riviera.platform.customer.vocabulary.CustomerId(rs.getLong(COL_CUSTOMER_ID)),
				rs.getObject(COL_BOOKING_DATE, LocalDate.class),
				rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
				cancelledAt == null ? null : cancelledAt.toInstant(), refundMinor,
				requestExpiresAt == null ? null : requestExpiresAt.toInstant(),
				refundReasonOf(cancelReason), rs.getTimestamp(COL_CREATED_AT).toInstant(),
				acceptedAt == null ? null : acceptedAt.toInstant(),
				movedAt == null ? null : movedAt.toInstant());
	}

	/**
	 * The {@code cancel_reason} token as a {@link RefundReason}, or {@code null} when it is absent
	 * <em>or</em> not a constant this build knows. Tolerant on purpose: this mapper also serves the
	 * account-scoped list, so a token added to the V14 CHECK ahead of the enum would otherwise
	 * throw out of every row of {@code GET /api/me/bookings}, not just the one view that reads the
	 * field. An unknown reason degrades to the same neutral copy an absent one gets.
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
				RETURNING id, venue_id, set_id, booking_date, created_at, amount_minor, amount_currency
				""")
				.param(PARAM_STATUS, BookingStatus.CONFIRMED.name())
				.param("at", java.sql.Timestamp.from(confirmedAt))
				.param("id", bookingId)
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.query((rs, rowNum) -> new ConfirmedBooking(
						rs.getLong("id"), new VenueId(rs.getLong(COL_VENUE_ID)),
						new SetId(rs.getLong(COL_SET_ID)), rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						rs.getTimestamp(COL_CREATED_AT).toInstant(),
						rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY)))
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
	 * The one cancellation write, guarded on {@code admitted}. {@code RETURNING} yields the facts
	 * only on a real transition, so a double-cancel — or a status outside {@code admitted} — is a
	 * 0-row {@code empty} no-op and the caller releases the set, refunds and publishes exactly
	 * once. The reason (POLICY/WEATHER/VENUE_CHANGE) is the audit of why it happened (invariant
	 * #10). Shared so the two entry points cannot drift in the columns they stamp or the facts they
	 * return; only the admitted statuses and the reason differ, which is exactly what the
	 * guest/admin split is about.
	 *
	 * <p>{@code admitted} is bound from the caller's row in {@link BookingTransition}, so the
	 * guest/admin difference over {@code NO_SHOW} is stated once rather than as two list literals a
	 * line apart. The statement itself is unchanged: still one {@code WHERE status = ANY
	 * (:admitted)}.
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
				.param("reason", reason.name())
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
	 * Two statements in the caller's transaction: the guarded stamp on today's row, then {@link
	 * #RESOLVE_STAY_SQL} for the stay when no later service day remains. The stamp takes the
	 * booking row's lock first ({@code FOR UPDATE} on the stay, whose status it guards on), so a
	 * concurrent cancel or weather refund and a scan still leave exactly one winner, as one {@code
	 * UPDATE booking} did; the service-day row's lock then leaves one winner per service day. Lock
	 * order — booking, today's service day, the stay's earlier service days — never crosses the
	 * sweep's, which takes service days alone or a due stay (one with no service day left) first.
	 * The resolve is skipped on a miss, so a lost race never touches the parent.
	 */
	@Override
	public Optional<CompletedCheckIn> completeConfirmed(String code, VenueId venueId,
			LocalDate serviceDate, Instant completedAt) {
		Optional<CompletedCheckIn> attended = jdbc.sql("""
				WITH stay AS (
				    SELECT id, set_id, booking_date
				    FROM booking
				    WHERE code = :code AND venue_id = :venue AND status = :confirmed
				    FOR UPDATE
				)
				UPDATE booking_day n
				SET attended_at = :at
				FROM stay
				WHERE n.booking_id = stay.id AND n.service_date = :date
				  AND n.attended_at IS NULL AND n.missed_at IS NULL
				RETURNING stay.id, stay.set_id, stay.booking_date
				""")
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
	 * On {@code sweepJdbc}, not {@code jdbc}: this statement opens a scheduled run and is bounded.
	 * Batched via a keyed CTE so a run cut off by that bound keeps the batches it committed: a
	 * batch is {@code batchSize} live stays with a past service day still unresolved, and every
	 * such service day of theirs is marked, so the count is at least the stays and "fewer than a
	 * batch" still means drained.
	 *
	 * <p>{@code FOR UPDATE} <strong>without</strong> {@code SKIP LOCKED}, deliberately: skipping a
	 * contended row would return a short batch, which the caller reads as "backlog drained" and
	 * stops on — leaving that row unswept until a later run found it uncontended. The lock is the
	 * stay's booking row, whose status the statement guards on, taken before its service-day rows:
	 * the same order check-in and the resolve take, so a scan, a cancel and the sweep serialize on
	 * the stay and none can stamp a service day of a stay another has just ended.
	 *
	 * <p>Ordered by {@code booking_date}, the partial sweep index's own order, so the batch walks
	 * it instead of sorting the filtered set and drains the oldest backlog first.
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
	public Optional<CheckInFacts> findCheckInFacts(String code, VenueId venueId, LocalDate today) {
		// Venue-scoped on purpose: a foreign venue's code reads as empty, same as an unknown one.
		return jdbc.sql("""
				SELECT b.status, b.booking_date, n.attended_at IS NOT NULL AS attended_today
				FROM booking b
				LEFT JOIN booking_day n ON n.booking_id = b.id AND n.service_date = :today
				WHERE b.code = :code AND b.venue_id = :venue
				""")
				.param("code", code)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_TODAY, today)
				.query((rs, rowNum) -> new CheckInFacts(
						BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						rs.getBoolean("attended_today")))
				.optional();
	}

	/**
	 * Staff daily view (U8): a venue's settled bookings whose span covers one day, ordered by set —
	 * {@code COMPLETED} and {@code NO_SHOW} ride along with {@code CONFIRMED}, so a past day lists who
	 * was booked instead of nothing. Served by {@code booking_venue_id_idx} (V5); the overlap and
	 * status predicates narrow the venue's rows. The code is selected for staff verification
	 * (invariant #7) — returned to the operator-gated caller, never logged here.
	 */
	@Override
	public List<DailyBooking> findSettledForVenueOn(VenueId venueId, LocalDate date) {
		return jdbc.sql("""
				SELECT set_id, code, status
				FROM booking
				WHERE venue_id = :venue AND booking_date <= :date AND last_date >= :date
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
	 * Weather refund (U9): every {@code CONFIRMED} booking, plus the {@code NO_SHOW}s the sweep made of
	 * guests who stayed home, whose span covers the date — a stay mid-storm selects too, carrying its
	 * span so the caller can tell it from a one-day booking. Served by {@code booking_venue_id_idx}
	 * (V5); the overlap and status predicates narrow the venue's rows. The amount is the FULL refund
	 * the caller stamps on a one-day booking via the guarded {@link #cancelForWeather}.
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
		// Guarded per-row expiry: RETURNING yields the (set, date) exactly when THIS statement
		// transitioned the row, so the hold is released exactly once (invariant #2); a candidate
		// accepted or declined since the candidate read is a 0-row empty no-op.
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
		// UPDATE ... RETURNING yields the (set, date) only when a row actually transitioned, so the
		// caller releases the availability claim exactly once (invariant #2). A booking no longer
		// AWAITING_PAYMENT returns empty — nothing to release.
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
