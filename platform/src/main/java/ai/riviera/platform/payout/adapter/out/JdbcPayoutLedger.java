package ai.riviera.platform.payout.adapter.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.application.LedgerEntryRow;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.application.VenueChangeRefundTotal;
import ai.riviera.platform.payout.application.VenuePeriodTotal;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.payout.domain.Reversed;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter for {@link PayoutLedger} — explicit SQL via {@link JdbcClient} (invariant #1).
 *
 * <p>Every write is an atomic {@code INSERT … ON CONFLICT (booking_id, entry_type, service_date) DO
 * NOTHING}: a re-delivered event (the registry is at-least-once) hits the
 * {@code UNIQUE NULLS NOT DISTINCT (booking_id, entry_type, service_date)} guard (V69) and writes nothing —
 * exactly-once per booking, and per day for a DAY_REVERSAL, without a read-modify-write race (#9).
 */
@Repository
class JdbcPayoutLedger implements PayoutLedger {

	// Result-column / param names reused across the row mappers (kept in lockstep with the SQL).
	private static final String COL_VENUE_ID = "venue_id";
	private static final String COL_NET_MINOR = "net_minor";
	private static final String COL_CURRENCY = "currency";
	private static final String COL_GROSS_MINOR = "gross_minor";
	private static final String COL_COMMISSION_MINOR = "commission_minor";
	private static final String PARAM_BOOKING = "booking";

	private final JdbcClient jdbc;

	JdbcPayoutLedger(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void accrue(PayoutLedgerEntry entry) {
		insertIdempotently(entry);
	}

	@Override
	public void reverse(PayoutLedgerEntry entry) {
		// UNIQUE (booking_id, entry_type, service_date): a redelivery writes no second REVERSAL or DAY_REVERSAL (#9).
		insertIdempotently(entry);
	}

	@Override
	public void charge(PayoutLedgerEntry entry) {
		// The dateless key (booking_id, entry_type, NULL) gives one FEE per booking (exactly-once, invariant #9).
		insertIdempotently(entry);
	}

	@Override
	public Optional<PayoutLedgerEntry> findAccrual(long bookingId) {
		// FOR UPDATE: a booking's reversals serialize on its accrual, so each reads the ones before it.
		return jdbc.sql("""
				SELECT venue_id, booking_id, gross_minor, commission_minor, net_minor, currency
				FROM payout_ledger_entry
				WHERE booking_id = :booking AND entry_type = 'ACCRUAL'
				FOR UPDATE
				""")
				.param(PARAM_BOOKING, bookingId)
				.query((rs, rowNum) -> new PayoutLedgerEntry(
						new VenueId(rs.getLong(COL_VENUE_ID)), rs.getLong("booking_id"), EntryType.ACCRUAL,
						rs.getLong(COL_GROSS_MINOR), rs.getLong(COL_COMMISSION_MINOR), rs.getLong(COL_NET_MINOR),
						rs.getString(COL_CURRENCY), null))
				.optional();
	}

	@Override
	public Reversed findReversed(long bookingId) {
		return jdbc.sql("""
				SELECT COALESCE(SUM(gross_minor), 0) AS gross_minor,
				       COALESCE(SUM(commission_minor), 0) AS commission_minor
				FROM payout_ledger_entry
				WHERE booking_id = :booking AND entry_type IN ('REVERSAL', 'DAY_REVERSAL')
				""")
				.param(PARAM_BOOKING, bookingId)
				.query((rs, rowNum) -> new Reversed(rs.getLong(COL_GROSS_MINOR), rs.getLong(COL_COMMISSION_MINOR)))
				.single();
	}

	@Override
	public List<LedgerEntryRow> entriesForVenue(VenueId venueId) {
		// Per-venue ledger read: all entries oldest-first; the caller folds the running net owed.
		// Served by payout_ledger_venue_idx (V9). reason is NULL on ACCRUAL rows.
		return jdbc.sql("""
				SELECT entry_type, booking_id, gross_minor, commission_minor, net_minor, currency,
				       reason, service_date, created_at
				FROM payout_ledger_entry
				WHERE venue_id = :venue
				ORDER BY created_at, id
				""")
				.param("venue", venueId.value())
				.query((rs, rowNum) -> {
					String reasonToken = rs.getString("reason");
					return new LedgerEntryRow(
							EntryType.valueOf(rs.getString("entry_type")), rs.getLong("booking_id"),
							rs.getLong(COL_GROSS_MINOR), rs.getLong(COL_COMMISSION_MINOR), rs.getLong(COL_NET_MINOR),
							rs.getString(COL_CURRENCY),
							reasonToken == null ? null : RefundReason.valueOf(reasonToken),
							rs.getObject("service_date", LocalDate.class),
							toInstant(rs.getTimestamp("created_at")));
				})
				.list();
	}

	private static Instant toInstant(java.sql.Timestamp ts) {
		return ts == null ? null : ts.toInstant();
	}

	/**
	 * Served by {@code payout_ledger_period_idx}. {@code MAX(currency)} is a single-value pick, sound
	 * while collection is EUR-only (invariant #5). A period whose reversals and fees exceed its
	 * accruals nets negative, which the batch column deliberately allows.
	 */
	@Override
	public List<VenuePeriodTotal> netTotalsForPeriod(PeriodKey period) {
		// Signed net owed per venue: only ACCRUAL adds, every other type deducts (invariant #9).
		return jdbc.sql("""
				SELECT venue_id,
				       SUM(CASE WHEN entry_type = 'ACCRUAL' THEN net_minor ELSE -net_minor END) AS net_minor,
				       MAX(currency) AS currency
				FROM payout_ledger_entry
				WHERE period_key = :period
				GROUP BY venue_id
				ORDER BY venue_id
				""")
				.param("period", period.value())
				.query((rs, rowNum) -> new VenuePeriodTotal(
						new VenueId(rs.getLong(COL_VENUE_ID)), rs.getLong(COL_NET_MINOR), rs.getString(COL_CURRENCY)))
				.list();
	}

	/**
	 * Served by {@code payout_ledger_venue_idx}; {@code MAX(currency)} is the same single-value pick as
	 * {@link #netTotalsForPeriod}'s.
	 */
	@Override
	public List<VenueChangeRefundTotal> venueChangeTotals() {
		// Two aggregates over one scan, kept apart by entry type; adding them would double-count.
		return jdbc.sql("""
				SELECT venue_id,
				       COUNT(*) FILTER (WHERE entry_type = 'REVERSAL')                        AS refund_count,
				       COALESCE(SUM(gross_minor) FILTER (WHERE entry_type = 'REVERSAL'), 0)   AS refunded_minor,
				       COALESCE(SUM(net_minor) FILTER (WHERE entry_type = 'FEE'), 0)          AS fee_minor,
				       MAX(currency) AS currency
				FROM payout_ledger_entry
				WHERE reason = 'VENUE_CHANGE'
				GROUP BY venue_id
				ORDER BY venue_id
				""")
				.query((rs, rowNum) -> new VenueChangeRefundTotal(
						new VenueId(rs.getLong(COL_VENUE_ID)), rs.getInt("refund_count"),
						rs.getLong("refunded_minor"), rs.getLong("fee_minor"), rs.getString(COL_CURRENCY)))
				.list();
	}

	/** Conflict-free insert shared by every entry type — {@code ON CONFLICT (booking_id, entry_type, service_date)}. */
	private void insertIdempotently(PayoutLedgerEntry entry) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, service_date, gross_minor,
				                                 commission_minor, net_minor, currency, reason)
				VALUES (:venue, :booking, :type, :day, :gross, :commission, :net, :currency, :reason)
				ON CONFLICT (booking_id, entry_type, service_date) DO NOTHING
				""")
				.param("venue", entry.venueId().value())
				.param(PARAM_BOOKING, entry.bookingId())
				.param("type", entry.entryType().name())
				.param("day", entry.serviceDate())
				.param("gross", entry.grossMinor())
				.param("commission", entry.commissionMinor())
				.param("net", entry.netMinor())
				.param(COL_CURRENCY, entry.currency())
				.param("reason", entry.reason() == null ? null : entry.reason().name())
				.update();
	}
}
