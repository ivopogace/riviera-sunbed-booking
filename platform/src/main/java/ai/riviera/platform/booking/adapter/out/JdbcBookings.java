package ai.riviera.platform.booking.adapter.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

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
import ai.riviera.platform.booking.domain.BookingStatus;
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

	// Result-column names reused across the row mappers (keep in lockstep with the SELECT/RETURNING).
	private static final String COL_VENUE_ID = "venue_id";
	private static final String COL_SET_ID = "set_id";
	private static final String COL_BOOKING_DATE = "booking_date";
	private static final String COL_AMOUNT_MINOR = "amount_minor";
	private static final String COL_AMOUNT_CURRENCY = "amount_currency";
	private static final String COL_REQUEST_EXPIRES_AT = "request_expires_at";
	private static final String COL_CUSTOMER_ID = "customer_id";
	private static final String COL_CANCEL_REASON = "cancel_reason";

	private final JdbcClient jdbc;

	/**
	 * The scheduled sweeps' statements run on the scheduler, never on a request thread, and they
	 * alone use this bounded client. See {@link #boundedClient}.
	 */
	private final JdbcClient sweepJdbc;

	JdbcBookings(JdbcClient jdbc, DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int scheduledQueryTimeoutSeconds) {
		this.jdbc = jdbc;
		this.sweepJdbc = boundedClient(dataSource, scheduledQueryTimeoutSeconds);
	}

	/**
	 * A {@link JdbcClient} of this adapter's own with a finite {@code queryTimeout}, used by the
	 * abandoned-payment, request-expiry and no-show sweeps and by nothing else — the
	 * {@code JdbcEmailSuppressions#boundedClient} idiom applied to scheduled work.
	 *
	 * <p>Postgres's default statement timeout is infinite, so a wedged candidate read — a migration
	 * holding {@code ACCESS EXCLUSIVE} on {@code booking} during a rolling deploy is the realistic
	 * one — has no natural end. An unbounded sweep that never returns keeps its thread and its pooled
	 * connection forever, and the abandoned-payment sweep going silent means expired bookings keep
	 * their {@code (set, date)} claims: sets that stay unsellable, in the safe direction, with no
	 * alarm. Bounded, the run fails, is logged, and the next tick five minutes later retries — every
	 * sweep is idempotent and its per-row transitions are guarded, so a lost run costs nothing.
	 *
	 * <p><strong>Why the sweeps and not this whole adapter.</strong> The rest of {@code Bookings} is
	 * the request path, including the guarded {@code UPDATE … RETURNING} that releases a claim. Those
	 * writes take row locks on {@code set_availability}, invariant #2's table, and bounding them would
	 * be the reach #395 exists to avoid — the timeout stops at the reads that open a scheduled run.
	 * For the same reason this is not {@code spring.jdbc.template.query-timeout}, which would bound
	 * every statement in the application including the claim itself; {@code ScheduledWorkArchitectureTest}
	 * fails the build if that global is ever set.
	 */
	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		return JdbcClient.create(bounded);
	}

	/**
	 * The nullable account link as a bindable {@code Long}: the signed-in
	 * {@link ai.riviera.platform.customer.vocabulary.CustomerAccountId} value, or {@code null} for a
	 * guest booking (the guest checkout path leaves {@code account_id} NULL).
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
	 * makes a code collision a no-op (empty result), NOT a thrown unique violation — so the caller's
	 * regenerate-and-retry works WITHOUT aborting the surrounding transaction (a thrown violation
	 * would poison it). FK/CHECK failures still throw, as they should. RETURNING yields the id only
	 * on a real insert. {@code request_expires_at} binds NULL on the instant path — only a pending
	 * request stores a deadline.
	 */
	private OptionalLong insert(NewBooking b, BookingStatus status, Instant requestExpiresAt) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :customer, :account, :date, :amount, :currency, :status, :expires)
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
				RETURNING id, venue_id, set_id, booking_date, accepted_at, amount_minor, amount_currency
				""")
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.param("now", java.sql.Timestamp.from(now))
				.param("id", bookingId)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new ai.riviera.platform.booking.application.request.AcceptedRequest(
						rs.getLong("id"), new VenueId(rs.getLong(COL_VENUE_ID)),
						new SetId(rs.getLong(COL_SET_ID)), rs.getObject(COL_BOOKING_DATE, LocalDate.class),
						rs.getTimestamp("accepted_at").toInstant(), rs.getLong(COL_AMOUNT_MINOR),
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
	public Optional<ai.riviera.platform.booking.application.request.WithdrawnRequest>
			withdrawPendingRequest(String code) {
		// One statement is the whole decision — no read-then-write window (contract: the port).
		return jdbc.sql("""
				UPDATE booking
				SET status = :withdrawn
				WHERE code = :code AND status = :pending
				RETURNING id, set_id, booking_date
				""")
				.param("withdrawn", BookingStatus.WITHDRAWN.name())
				.param("code", code)
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.query((rs, rowNum) -> new ai.riviera.platform.booking.application.request.WithdrawnRequest(
						rs.getLong("id"), new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
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
						rs.getTimestamp("created_at").toInstant(),
						rs.getTimestamp(COL_REQUEST_EXPIRES_AT).toInstant()))
				.list();
	}

	@Override
	public Optional<BookingRecord> findByCode(String code) {
		return jdbc.sql("""
				SELECT id, code, status, venue_id, set_id, customer_id, booking_date,
				       amount_minor, amount_currency, cancelled_at, refund_minor, request_expires_at,
				       cancel_reason
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
				       cancel_reason
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
		return new BookingRecord(
				rs.getLong("id"), rs.getString("code"),
				BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
				new VenueId(rs.getLong(COL_VENUE_ID)), new SetId(rs.getLong(COL_SET_ID)),
				new ai.riviera.platform.customer.vocabulary.CustomerId(rs.getLong(COL_CUSTOMER_ID)),
				rs.getObject(COL_BOOKING_DATE, LocalDate.class),
				rs.getLong(COL_AMOUNT_MINOR), rs.getString(COL_AMOUNT_CURRENCY),
				cancelledAt == null ? null : cancelledAt.toInstant(), refundMinor,
				requestExpiresAt == null ? null : requestExpiresAt.toInstant(),
				refundReasonOf(cancelReason));
	}

	/**
	 * The {@code cancel_reason} token as a {@link RefundReason}, or {@code null} when it is absent
	 * <em>or</em> not a constant this build knows. Tolerant on purpose: this mapper also serves the
	 * account-scoped list, so a token added to the V14 CHECK ahead of the enum would otherwise throw
	 * out of every row of {@code GET /api/me/bookings}, not just the one view that reads the field.
	 * An unknown reason degrades to the same neutral copy an absent one gets.
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
			long refundMinor, RefundReason reason) {
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
	public Optional<CompletedCheckIn> completeConfirmed(String code, VenueId venueId,
			LocalDate serviceDate, Instant completedAt) {
		// Guarded CONFIRMED -> COMPLETED (#583): the row lock leaves exactly one winner per code.
		return jdbc.sql("""
				UPDATE booking
				SET status = :completed, completed_at = :at
				WHERE code = :code AND venue_id = :venue AND status = :confirmed AND booking_date = :date
				RETURNING id, set_id, booking_date
				""")
				.param(PARAM_COMPLETED, BookingStatus.COMPLETED.name())
				.param("at", java.sql.Timestamp.from(completedAt))
				.param("code", code)
				.param(PARAM_VENUE, venueId.value())
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param("date", serviceDate)
				.query((rs, rowNum) -> new CompletedCheckIn(
						rs.getLong("id"), new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
				.optional();
	}

	@Override
	public int markPastConfirmedAsNoShow(LocalDate today) {
		// sweepJdbc, not jdbc: this statement opens a scheduled run and is bounded.
		return sweepJdbc.sql("""
				UPDATE booking
				SET status = :noShow
				WHERE status = :confirmed AND booking_date < :today
				""")
				.param("noShow", BookingStatus.NO_SHOW.name())
				.param(PARAM_CONFIRMED, BookingStatus.CONFIRMED.name())
				.param("today", today)
				.update();
	}

	@Override
	public Optional<CheckInFacts> findCheckInFacts(String code, VenueId venueId) {
		// Venue-scoped on purpose: a foreign venue's code reads as empty, same as an unknown one.
		return jdbc.sql("""
				SELECT status, booking_date
				FROM booking
				WHERE code = :code AND venue_id = :venue
				""")
				.param("code", code)
				.param(PARAM_VENUE, venueId.value())
				.query((rs, rowNum) -> new CheckInFacts(
						BookingStatus.valueOf(rs.getString(PARAM_STATUS)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
				.optional();
	}

	@Override
	public List<DailyBooking> findConfirmedForVenueOn(VenueId venueId, LocalDate date) {
		// Staff daily view (U8): a venue's settled bookings for one day, ordered by set. Served by
		// booking_venue_id_idx (V5); the (booking_date, status) filter narrows the venue's rows. The
		// code is selected for staff verification (invariant #7) — returned to the operator-gated
		// caller, never logged here.
		// COMPLETED and NO_SHOW ride along, so a past day lists who was booked instead of nothing.
		return jdbc.sql("""
				SELECT set_id, code, status
				FROM booking
				WHERE venue_id = :venue AND booking_date = :date
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
	public List<BookingId> findExpirableAwaitingPayment(Instant createdBefore, Instant acceptedBefore,
			LocalDate serviceDayOnOrBefore) {
		// Abandoned-payment sweep candidates, two clocks: an instant booking
		// (accepted_at IS NULL) expires on the creation clock — served by
		// booking_awaiting_created_idx (V13); an accepted request expires on the accept clock —
		// served by booking_awaiting_accepted_idx (V19). Never the other way around: an accepted
		// request judged by created_at would be swept the moment it was accepted.
		// The third arm needs no index of its own: it shares the partial predicate both carry.
		// sweepJdbc, not jdbc: this read opens a scheduled run and is bounded.
		return sweepJdbc.sql("""
				SELECT id
				FROM booking
				WHERE status = :awaiting
				  AND (booking_date <= :serviceDayOnOrBefore
				    OR (accepted_at IS NULL AND created_at < :createdBefore)
				    OR (accepted_at IS NOT NULL AND accepted_at < :acceptedBefore))
				ORDER BY id
				""")
				.param(PARAM_AWAITING, BookingStatus.AWAITING_PAYMENT.name())
				.param("createdBefore", java.sql.Timestamp.from(createdBefore))
				.param("acceptedBefore", java.sql.Timestamp.from(acceptedBefore))
				.param("serviceDayOnOrBefore", serviceDayOnOrBefore)
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
				RETURNING set_id, booking_date
				""")
				.param("expired", BookingStatus.EXPIRED.name())
				.param("id", bookingId)
				.param(PARAM_PENDING, BookingStatus.PENDING_REQUEST.name())
				.param("now", java.sql.Timestamp.from(now))
				.query((rs, rowNum) -> new ClaimRef(new SetId(rs.getLong(COL_SET_ID)),
						rs.getObject(COL_BOOKING_DATE, LocalDate.class)))
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
