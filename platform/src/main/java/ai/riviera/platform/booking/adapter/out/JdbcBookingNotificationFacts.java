package ai.riviera.platform.booking.adapter.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingMoveFacts;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.vocabulary.StayMoveFacts;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.SetSpot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter for {@link BookingNotificationFacts} over {@link JdbcClient} (invariant #1): by primary
 * key, bar the stay reads, which walk {@code booking_stay_id_idx}. {@code confirmationFacts} and the stay
 * facts re-derive the birth window a resend has no payload for; {@code moveFacts} adds the free-exit
 * deadline {@link BookingCutoff} derives. Package-private; only the {@code api/} port is referenced
 * cross-module (invariant #11). Read-only.
 */
@Repository
class JdbcBookingNotificationFacts implements BookingNotificationFacts {

	private static final String COL_CUSTOMER_ID = "customer_id";
	private static final String MOVED_ROW_SQL = """
			SELECT b.moved_at, s.first_date AS stay_first_date
			FROM booking b
			LEFT JOIN stay s ON s.id = b.stay_id
			WHERE b.id = :id AND b.moved_at IS NOT NULL
			""";

	/** The arriving stretch and the live stretch it follows on another set; nothing when either has gone. */
	private static final String MOVE_ROW_SQL = """
			SELECT s.id AS stay_id, s.code, s.last_date AS stay_last_date, t.customer_id, t.venue_id,
			       t.booking_date, p.set_id AS from_set, t.set_id AS to_set
			FROM booking t
			JOIN stay s ON s.id = t.stay_id
			JOIN booking p ON p.stay_id = t.stay_id AND p.id <> t.id AND p.last_date = t.booking_date - 1
			WHERE t.id = :id AND t.status = :confirmed AND t.set_id <> p.set_id
			  AND p.status IN (:confirmed, :completed)
			""";

	private final JdbcClient jdbc;
	private final CancellationPolicy cancellationPolicy;
	private final RemodelReceipts receipts;
	private final BookingCutoff cutoff;
	private final SetBookingFacts sets;

	JdbcBookingNotificationFacts(JdbcClient jdbc, CancellationPolicy cancellationPolicy, RemodelReceipts receipts,
			BookingCutoff cutoff, SetBookingFacts sets) {
		this.jdbc = jdbc;
		this.cancellationPolicy = cancellationPolicy;
		this.receipts = receipts;
		this.cutoff = cutoff;
		this.sets = sets;
	}

	@Override
	public Optional<StayMoveFacts> moveReminderFacts(BookingId arrivingBookingId) {
		return jdbc.sql(MOVE_ROW_SQL)
				.param("id", arrivingBookingId.value())
				.param("confirmed", BookingStatus.CONFIRMED.name())
				.param("completed", BookingStatus.COMPLETED.name())
				.query((rs, rowNum) -> new MoveRow(new StayId(rs.getLong("stay_id")), rs.getString("code"),
						new CustomerId(rs.getLong(COL_CUSTOMER_ID)), new VenueId(rs.getLong("venue_id")),
						rs.getObject("booking_date", LocalDate.class), rs.getObject("stay_last_date", LocalDate.class),
						new SetId(rs.getLong("from_set")), new SetId(rs.getLong("to_set"))))
				.optional()
				.flatMap(this::placed);
	}

	/** The row with its distance off the live map; empty if either set is no longer an active spot. */
	private Optional<StayMoveFacts> placed(MoveRow row) {
		Map<SetId, SetPlacement> placements = sets.activeSetsOf(row.venueId()).stream()
				.collect(Collectors.toMap(SetSpot::setId, SetSpot::placement));
		SetPlacement from = placements.get(row.fromSet());
		SetPlacement to = placements.get(row.toSet());
		if (from == null || to == null) {
			return Optional.empty();
		}
		return Optional.of(new StayMoveFacts(row.stayId(), row.code(), row.customerId(), row.moveDate(),
				row.stayLastDate(), row.fromSet(), row.toSet(), to.rowsAway(from), to.positionsAway(from)));
	}

	private record MoveRow(StayId stayId, String code, CustomerId customerId, VenueId venueId, LocalDate moveDate,
			LocalDate stayLastDate, SetId fromSet, SetId toSet) {
	}

	@Override
	public Optional<BookingMoveFacts> moveFacts(BookingId bookingId) {
		return receipts.latestMoveOf(bookingId).flatMap(move -> jdbc.sql(MOVED_ROW_SQL)
				.param("id", bookingId.value())
				.query((rs, rowNum) -> new MovedRow(rs.getTimestamp("moved_at").toInstant(),
						rs.getObject("stay_first_date", LocalDate.class)))
				.optional()
				.map(row -> {
					LocalDate windowDay = row.stayFirstDay() != null ? row.stayFirstDay() : move.bookingDate();
					Instant exit = cutoff.freeExitEndsAt(move.bookingDate(), windowDay, row.movedAt());
					return new BookingMoveFacts(move.bookingDate(), move.from().rowLabel(), move.from().positionNo(),
							move.to().rowLabel(), move.to().positionNo(), move.rowsAway(), move.positionsAway(),
							row.movedAt(), exit.isAfter(row.movedAt()) ? exit : null, row.stayFirstDay() != null);
				}));
	}

	/** A moved booking's move instant and, for a stay's stretch, the stay's first day (the day it is judged on). */
	private record MovedRow(Instant movedAt, LocalDate stayFirstDay) {
	}

	@Override
	public boolean endedByRemodel(BookingId bookingId) {
		return receipts.endedByRemodel(bookingId);
	}

	@Override
	public Optional<BookingNotificationInfo> notificationInfo(BookingId bookingId) {
		// No status predicate on purpose — the caller reacts to a published confirmation fact, and a
		// booking cancelled in the interim must still resolve (the port's contract).
		return jdbc.sql("SELECT COALESCE(s.code, b.code) AS code, b.customer_id FROM booking b "
						+ "LEFT JOIN stay s ON s.id = b.stay_id WHERE b.id = :id")
				.param("id", bookingId.value())
				.query((rs, rowNum) -> new BookingNotificationInfo(
						rs.getString("code"), new CustomerId(rs.getLong(COL_CUSTOMER_ID))))
				.optional();
	}

	@Override
	public Optional<BookingConfirmationFacts> confirmationFacts(BookingId bookingId) {
		// confirmed_at, not status — see BookingConfirmationFacts#everConfirmed for why.
		return jdbc.sql("""
				SELECT b.set_id, b.booking_date, b.last_date, b.amount_minor, b.amount_currency,
				       COALESCE(s.code, b.code) AS code, b.customer_id,
				       b.confirmed_at IS NOT NULL AS ever_confirmed, b.created_at
				FROM booking b
				LEFT JOIN stay s ON s.id = b.stay_id
				WHERE b.id = :id
				""")
				.param("id", bookingId.value())
				.query((rs, rowNum) -> factsOf(rs))
				.optional();
	}

	@Override
	public Optional<StayConfirmationFacts> stayConfirmationFacts(StayId stayId) {
		List<StayRow> rows = jdbc.sql("""
				SELECT s.code, b.id, b.set_id, b.booking_date, b.last_date, b.amount_minor, b.amount_currency,
				       b.customer_id, b.confirmed_at IS NOT NULL AS confirmed, b.created_at
				FROM stay s
				JOIN booking b ON b.stay_id = s.id
				WHERE s.id = :stay
				ORDER BY b.booking_date
				""")
				.param("stay", stayId.value())
				.query((rs, rowNum) -> new StayRow(rs.getString("code"),
						new StayConfirmationFacts.Stop(new BookingId(rs.getLong("id")), new SetId(rs.getLong("set_id")),
								rs.getObject("booking_date", LocalDate.class), rs.getObject("last_date", LocalDate.class)),
						rs.getLong("amount_minor"), rs.getString("amount_currency"),
						new CustomerId(rs.getLong(COL_CUSTOMER_ID)), rs.getBoolean("confirmed"),
						rs.getTimestamp("created_at").toInstant()))
				.list();
		if (rows.isEmpty()) {
			return Optional.empty();
		}
		StayRow first = rows.getFirst();
		Optional<CancellationPolicy.BirthTerms> birth = cancellationPolicy.windowAtBirth(
				first.stop().setId(), first.stop().firstDate(), first.createdAt());
		return Optional.of(new StayConfirmationFacts(stayId, first.code(), first.customerId(),
				rows.stream().map(StayRow::stop).toList(), rows.stream().mapToLong(StayRow::amountMinor).sum(),
				first.currency(), rows.stream().allMatch(StayRow::confirmed),
				birth.map(CancellationPolicy.BirthTerms::window).orElse(null),
				birth.map(CancellationPolicy.BirthTerms::lateCancelRefundBps).orElse(0)));
	}

	@Override
	public Optional<StayConfirmationFacts> stayConfirmationFactsOf(BookingId bookingId) {
		return jdbc.sql("SELECT stay_id FROM booking WHERE id = :id AND stay_id IS NOT NULL")
				.param("id", bookingId.value())
				.query(Long.class)
				.optional()
				.flatMap(stayId -> stayConfirmationFacts(new StayId(stayId)));
	}

	private record StayRow(String code, StayConfirmationFacts.Stop stop, long amountMinor, String currency,
			CustomerId customerId, boolean confirmed, Instant createdAt) {
	}

	/**
	 * A resend has no event payload, so the window-at-birth is re-derived here from the venue's
	 * current cutoff via {@code CancellationPolicy} — bounded, documented drift after a cutoff edit;
	 * the automatic listener's stamped event stays the record of what was first sent.
	 */
	private BookingConfirmationFacts factsOf(java.sql.ResultSet rs) throws java.sql.SQLException {
		SetId setId = new SetId(rs.getLong("set_id"));
		LocalDate bookingDate = rs.getObject("booking_date", LocalDate.class);
		Optional<CancellationPolicy.BirthTerms> birth = cancellationPolicy.windowAtBirth(
				setId, bookingDate, rs.getTimestamp("created_at").toInstant());
		return new BookingConfirmationFacts(
				setId,
				bookingDate,
				rs.getObject("last_date", LocalDate.class),
				rs.getLong("amount_minor"),
				rs.getString("amount_currency"),
				rs.getString("code"),
				new CustomerId(rs.getLong(COL_CUSTOMER_ID)),
				rs.getBoolean("ever_confirmed"),
				birth.map(CancellationPolicy.BirthTerms::window).orElse(null),
				birth.map(CancellationPolicy.BirthTerms::lateCancelRefundBps).orElse(0));
	}
}
