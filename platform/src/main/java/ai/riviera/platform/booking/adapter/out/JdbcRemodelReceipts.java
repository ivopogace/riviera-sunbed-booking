package ai.riviera.platform.booking.adapter.out;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.application.remodel.NewReceipt;
import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcome;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcomeKind;
import ai.riviera.platform.booking.application.remodel.RemodelReceipt;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter for {@link RemodelReceipts} (invariant #1): one insert per receipt, per move and
 * per ended claim, the venue-scoped reads off {@code remodel_receipt_venue_idx}, and the two
 * per-booking reads off {@code remodel_receipt_move_booking_idx} and
 * {@code remodel_receipt_outcome_booking_idx}. Names no set table: every spot is
 * the row's own snapshot. Package-private; only the port is referenced.
 */
@Repository
class JdbcRemodelReceipts implements RemodelReceipts {

	private static final String MOVE_COLUMNS = """
			receipt_id, booking_id, booking_date, from_set_id, from_row_label, from_position_no,
			to_set_id, to_row_label, to_position_no, rows_away, positions_away
			""";
	private static final String OUTCOME_COLUMNS = """
			receipt_id, booking_id, booking_date, kind, set_id, row_label, position_no, amount_minor,
			amount_currency, fee_minor
			""";
	private static final String SELECT_MOVES = "SELECT " + MOVE_COLUMNS;
	private static final String SELECT_OUTCOMES = "SELECT " + OUTCOME_COLUMNS;
	private static final String P_VENUE = "venue";
	private static final String P_RECEIPT = "receipt";
	private static final String P_BOOKING = "booking";
	private static final String P_DATE = "date";
	private static final String P_REASON = "reason";
	private static final String C_REASON = "refund_reason";
	private static final String C_BOOKING = "booking_id";
	private static final String C_DATE = "booking_date";

	private final JdbcClient jdbc;

	JdbcRemodelReceipts(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public ReceiptId store(NewReceipt receipt) {
		long id = jdbc.sql("""
				INSERT INTO remodel_receipt (venue_id, operator_id, committed_at, refund_reason)
				VALUES (:venue, :operator, :at, :reason)
				RETURNING id
				""")
				.param(P_VENUE, receipt.venueId().value())
				.param("operator", receipt.operatorId().value())
				.param("at", java.sql.Timestamp.from(receipt.committedAt()))
				.param(P_REASON, receipt.refundReason().isBlank() ? null : receipt.refundReason())
				.query(Long.class)
				.single();
		receipt.moves().forEach(move -> insertMove(id, move));
		receipt.outcomes().forEach(outcome -> insertOutcome(id, outcome));
		return new ReceiptId(id);
	}

	private void insertMove(long receiptId, ReceiptMove move) {
		jdbc.sql("INSERT INTO remodel_receipt_move (" + MOVE_COLUMNS + """
				) VALUES (:receipt, :booking, :date, :fromSet, :fromRow, :fromPosition,
				          :toSet, :toRow, :toPosition, :rows, :positions)
				""")
				.param(P_RECEIPT, receiptId)
				.param(P_BOOKING, move.bookingId().value())
				.param(P_DATE, move.bookingDate())
				.param("fromSet", move.from().setId().value())
				.param("fromRow", move.from().rowLabel())
				.param("fromPosition", move.from().positionNo())
				.param("toSet", move.to().setId().value())
				.param("toRow", move.to().rowLabel())
				.param("toPosition", move.to().positionNo())
				.param("rows", move.rowsAway())
				.param("positions", move.positionsAway())
				.update();
	}

	private void insertOutcome(long receiptId, ReceiptOutcome outcome) {
		jdbc.sql("INSERT INTO remodel_receipt_outcome (" + OUTCOME_COLUMNS + """
				) VALUES (:receipt, :booking, :date, :kind, :set, :row, :position, :amount, :currency, :fee)
				""")
				.param(P_RECEIPT, receiptId)
				.param(P_BOOKING, outcome.bookingId().value())
				.param(P_DATE, outcome.bookingDate())
				.param("kind", outcome.kind().name())
				.param("set", outcome.spot().setId().value())
				.param("row", outcome.spot().rowLabel())
				.param("position", outcome.spot().positionNo())
				.param("amount", outcome.amountMinor())
				.param("currency", outcome.currency())
				.param("fee", outcome.feeMinor())
				.update();
	}

	@Override
	public List<RemodelReceipt> receiptsOf(VenueId venueId) {
		List<RemodelReceipt> heads = jdbc.sql("""
				SELECT id, venue_id, operator_id, committed_at, refund_reason FROM remodel_receipt
				WHERE venue_id = :venue
				ORDER BY committed_at DESC, id DESC
				""")
				.param(P_VENUE, venueId.value())
				.query(JdbcRemodelReceipts::mapHead)
				.list();
		if (heads.isEmpty()) {
			return List.of();
		}
		List<Long> ids = heads.stream().map(head -> head.id().value()).toList();
		Map<Long, List<ReceiptMove>> moves = groupBy(SELECT_MOVES
				+ "FROM remodel_receipt_move WHERE receipt_id IN (:receipts) ORDER BY id",
				ids, JdbcRemodelReceipts::mapMove);
		Map<Long, List<ReceiptOutcome>> outcomes = groupBy(SELECT_OUTCOMES
				+ "FROM remodel_receipt_outcome WHERE receipt_id IN (:receipts) ORDER BY id",
				ids, JdbcRemodelReceipts::mapOutcome);
		return heads.stream()
				.map(head -> withLines(head, moves.getOrDefault(head.id().value(), List.of()),
						outcomes.getOrDefault(head.id().value(), List.of())))
				.toList();
	}

	@Override
	public Optional<RemodelReceipt> find(VenueId venueId, ReceiptId receiptId) {
		return jdbc.sql("""
				SELECT id, venue_id, operator_id, committed_at, refund_reason FROM remodel_receipt
				WHERE id = :receipt AND venue_id = :venue
				""")
				.param(P_RECEIPT, receiptId.value())
				.param(P_VENUE, venueId.value())
				.query(JdbcRemodelReceipts::mapHead)
				.optional()
				.map(head -> withLines(head, linesOf(receiptId, SELECT_MOVES
						+ "FROM remodel_receipt_move WHERE receipt_id = :receipt ORDER BY id",
						JdbcRemodelReceipts::mapMove),
						linesOf(receiptId, SELECT_OUTCOMES
								+ "FROM remodel_receipt_outcome WHERE receipt_id = :receipt ORDER BY id",
								JdbcRemodelReceipts::mapOutcome)));
	}

	private <T> Map<Long, List<T>> groupBy(String sql, List<Long> receiptIds, RowReader<T> reader) {
		Map<Long, List<T>> grouped = new LinkedHashMap<>();
		jdbc.sql(sql)
				.param("receipts", receiptIds)
				.query((rs, rowNum) -> Map.entry(rs.getLong("receipt_id"), reader.read(rs)))
				.list()
				.forEach(entry -> grouped.computeIfAbsent(entry.getKey(), k -> new ArrayList<>()).add(entry.getValue()));
		return grouped;
	}

	private <T> List<T> linesOf(ReceiptId receiptId, String sql, RowReader<T> reader) {
		return jdbc.sql(sql)
				.param(P_RECEIPT, receiptId.value())
				.query((rs, rowNum) -> reader.read(rs))
				.list();
	}

	/** A row mapper that may throw, so the two line readers can be passed to the shared queries. */
	@FunctionalInterface
	private interface RowReader<T> {
		T read(ResultSet rs) throws SQLException;
	}

	@Override
	public Optional<ReceiptMove> latestMoveOf(BookingId bookingId) {
		return jdbc.sql(SELECT_MOVES + """
				FROM remodel_receipt_move WHERE booking_id = :booking ORDER BY id DESC LIMIT 1
				""")
				.param(P_BOOKING, bookingId.value())
				.query((rs, rowNum) -> mapMove(rs))
				.optional();
	}

	@Override
	public boolean endedByRemodel(BookingId bookingId) {
		return jdbc.sql("SELECT EXISTS(SELECT 1 FROM remodel_receipt_outcome WHERE booking_id = :booking)")
				.param(P_BOOKING, bookingId.value())
				.query(Boolean.class)
				.single();
	}

	private static RemodelReceipt withLines(RemodelReceipt head, List<ReceiptMove> moves,
			List<ReceiptOutcome> outcomes) {
		return new RemodelReceipt(head.id(), head.venueId(), head.operatorId(), head.committedAt(), moves, outcomes,
				head.refundReason());
	}

	/** A NULL reason reads as {@code ""} — the commit refunded nothing, so none was owed. */
	private static RemodelReceipt mapHead(ResultSet rs, int rowNum) throws SQLException {
		String reason = rs.getString(C_REASON);
		return new RemodelReceipt(new ReceiptId(rs.getLong("id")), new VenueId(rs.getLong("venue_id")),
				new OperatorId(rs.getLong("operator_id")), rs.getTimestamp("committed_at").toInstant(), List.of(),
				List.of(), reason == null ? "" : reason);
	}

	private static ReceiptOutcome mapOutcome(ResultSet rs) throws SQLException {
		return new ReceiptOutcome(new BookingId(rs.getLong(C_BOOKING)), rs.getObject(C_DATE, LocalDate.class),
				new SpotRef(new SetId(rs.getLong("set_id")), rs.getString("row_label"), rs.getInt("position_no")),
				ReceiptOutcomeKind.valueOf(rs.getString("kind")), rs.getLong("amount_minor"),
				rs.getString("amount_currency"), rs.getLong("fee_minor"));
	}

	private static ReceiptMove mapMove(ResultSet rs) throws SQLException {
		return new ReceiptMove(new BookingId(rs.getLong(C_BOOKING)),
				rs.getObject(C_DATE, LocalDate.class),
				new SpotRef(new SetId(rs.getLong("from_set_id")), rs.getString("from_row_label"),
						rs.getInt("from_position_no")),
				new SpotRef(new SetId(rs.getLong("to_set_id")), rs.getString("to_row_label"),
						rs.getInt("to_position_no")),
				rs.getInt("rows_away"), rs.getInt("positions_away"));
	}
}
