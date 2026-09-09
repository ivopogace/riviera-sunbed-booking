package ai.riviera.platform.booking.adapter.out;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.RemodelReceipt;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter for {@link RemodelReceipts} (invariant #1): one insert per receipt and one per move,
 * the venue-scoped reads off {@code remodel_receipt_venue_idx}, and the latest move per booking off
 * {@code remodel_receipt_move_booking_idx}. Names no set table: both spots are the row's own
 * snapshot. Package-private; only the port is referenced.
 */
@Repository
class JdbcRemodelReceipts implements RemodelReceipts {

	private static final String MOVE_COLUMNS = """
			receipt_id, booking_id, booking_date, from_set_id, from_row_label, from_position_no,
			to_set_id, to_row_label, to_position_no, rows_away, positions_away
			""";
	private static final String P_VENUE = "venue";
	private static final String P_RECEIPT = "receipt";

	private final JdbcClient jdbc;

	JdbcRemodelReceipts(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public ReceiptId record(VenueId venueId, OperatorId operatorId, Instant committedAt, List<ReceiptMove> moves) {
		long id = jdbc.sql("""
				INSERT INTO remodel_receipt (venue_id, operator_id, committed_at)
				VALUES (:venue, :operator, :at)
				RETURNING id
				""")
				.param(P_VENUE, venueId.value())
				.param("operator", operatorId.value())
				.param("at", java.sql.Timestamp.from(committedAt))
				.query(Long.class)
				.single();
		for (ReceiptMove move : moves) {
			jdbc.sql("INSERT INTO remodel_receipt_move (" + MOVE_COLUMNS + """
					) VALUES (:receipt, :booking, :date, :fromSet, :fromRow, :fromPosition,
					          :toSet, :toRow, :toPosition, :rows, :positions)
					""")
					.param(P_RECEIPT, id)
					.param("booking", move.bookingId().value())
					.param("date", move.bookingDate())
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
		return new ReceiptId(id);
	}

	@Override
	public List<RemodelReceipt> receiptsOf(VenueId venueId) {
		Map<Long, RemodelReceipt> heads = new LinkedHashMap<>();
		jdbc.sql("""
				SELECT id, venue_id, operator_id, committed_at FROM remodel_receipt
				WHERE venue_id = :venue
				ORDER BY committed_at DESC, id DESC
				""")
				.param(P_VENUE, venueId.value())
				.query(JdbcRemodelReceipts::mapHead)
				.list()
				.forEach(head -> heads.put(head.id().value(), head));
		if (heads.isEmpty()) {
			return List.of();
		}
		Map<Long, List<ReceiptMove>> moves = new LinkedHashMap<>();
		jdbc.sql("SELECT " + MOVE_COLUMNS + """
				FROM remodel_receipt_move WHERE receipt_id IN (:receipts) ORDER BY id
				""")
				.param("receipts", List.copyOf(heads.keySet()))
				.query((rs, rowNum) -> Map.entry(rs.getLong("receipt_id"), mapMove(rs)))
				.list()
				.forEach(entry -> moves.computeIfAbsent(entry.getKey(), k -> new ArrayList<>()).add(entry.getValue()));
		return heads.values().stream()
				.map(head -> withMoves(head, moves.getOrDefault(head.id().value(), List.of())))
				.toList();
	}

	@Override
	public Optional<RemodelReceipt> find(VenueId venueId, ReceiptId receiptId) {
		return jdbc.sql("""
				SELECT id, venue_id, operator_id, committed_at FROM remodel_receipt
				WHERE id = :receipt AND venue_id = :venue
				""")
				.param(P_RECEIPT, receiptId.value())
				.param(P_VENUE, venueId.value())
				.query(JdbcRemodelReceipts::mapHead)
				.optional()
				.map(head -> withMoves(head, jdbc.sql("SELECT " + MOVE_COLUMNS
						+ " FROM remodel_receipt_move WHERE receipt_id = :receipt ORDER BY id")
						.param(P_RECEIPT, receiptId.value())
						.query((rs, rowNum) -> mapMove(rs))
						.list()));
	}

	@Override
	public Optional<ReceiptMove> latestMoveOf(BookingId bookingId) {
		return jdbc.sql("SELECT " + MOVE_COLUMNS + """
				FROM remodel_receipt_move WHERE booking_id = :booking ORDER BY id DESC LIMIT 1
				""")
				.param("booking", bookingId.value())
				.query((rs, rowNum) -> mapMove(rs))
				.optional();
	}

	private static RemodelReceipt withMoves(RemodelReceipt head, List<ReceiptMove> moves) {
		return new RemodelReceipt(head.id(), head.venueId(), head.operatorId(), head.committedAt(), moves);
	}

	private static RemodelReceipt mapHead(ResultSet rs, int rowNum) throws SQLException {
		return new RemodelReceipt(new ReceiptId(rs.getLong("id")), new VenueId(rs.getLong("venue_id")),
				new OperatorId(rs.getLong("operator_id")), rs.getTimestamp("committed_at").toInstant(), List.of());
	}

	private static ReceiptMove mapMove(ResultSet rs) throws SQLException {
		return new ReceiptMove(new BookingId(rs.getLong("booking_id")),
				rs.getObject("booking_date", LocalDate.class),
				new SpotRef(new SetId(rs.getLong("from_set_id")), rs.getString("from_row_label"),
						rs.getInt("from_position_no")),
				new SpotRef(new SetId(rs.getLong("to_set_id")), rs.getString("to_row_label"),
						rs.getInt("to_position_no")),
				rs.getInt("rows_away"), rs.getInt("positions_away"));
	}
}
