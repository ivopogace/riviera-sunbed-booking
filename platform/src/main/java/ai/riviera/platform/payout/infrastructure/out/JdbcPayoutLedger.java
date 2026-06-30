package ai.riviera.platform.payout.infrastructure.out;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.RefundReason;
import ai.riviera.platform.payout.application.out.LedgerEntryRow;
import ai.riviera.platform.payout.application.out.PayoutLedger;
import ai.riviera.platform.payout.application.out.VenuePeriodTotal;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.venue.api.VenueId;

/**
 * JDBC adapter for {@link PayoutLedger} — explicit SQL via {@link JdbcClient}, no JPA (invariant
 * #1). Package-private; only the port is referenced cross-layer.
 *
 * <p>The accrual is an atomic {@code INSERT … ON CONFLICT (booking_id, entry_type) DO NOTHING}: a
 * re-delivered {@code BookingConfirmed} (the registry is at-least-once) hits the
 * {@code UNIQUE(booking_id, entry_type)} guard and writes nothing — exactly-once accrual without a
 * read-modify-write race (invariant #9), the payout analogue of the availability claim's
 * conflict-free insert.
 */
@Repository
class JdbcPayoutLedger implements PayoutLedger {

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
		// Same conflict-free insert as accrual; the UNIQUE(booking_id, entry_type) guard makes a
		// re-delivered BookingCancelled write no second REVERSAL (exactly-once, invariant #9).
		insertIdempotently(entry);
	}

	@Override
	public Optional<PayoutLedgerEntry> findAccrual(long bookingId) {
		return jdbc.sql("""
				SELECT venue_id, booking_id, gross_minor, commission_minor, net_minor, currency
				FROM payout_ledger_entry
				WHERE booking_id = :booking AND entry_type = 'ACCRUAL'
				""")
				.param("booking", bookingId)
				.query((rs, rowNum) -> new PayoutLedgerEntry(
						new VenueId(rs.getLong("venue_id")), rs.getLong("booking_id"), EntryType.ACCRUAL,
						rs.getLong("gross_minor"), rs.getLong("commission_minor"), rs.getLong("net_minor"),
						rs.getString("currency"), null))
				.optional();
	}

	@Override
	public List<LedgerEntryRow> entriesForVenue(VenueId venueId) {
		// Per-venue ledger read (U9): all entries oldest-first; the caller folds the running net owed.
		// Served by payout_ledger_venue_idx (V9). reason is NULL on ACCRUAL rows.
		return jdbc.sql("""
				SELECT entry_type, booking_id, gross_minor, commission_minor, net_minor, currency,
				       reason, created_at
				FROM payout_ledger_entry
				WHERE venue_id = :venue
				ORDER BY created_at, id
				""")
				.param("venue", venueId.value())
				.query((rs, rowNum) -> {
					String reasonToken = rs.getString("reason");
					return new LedgerEntryRow(
							EntryType.valueOf(rs.getString("entry_type")), rs.getLong("booking_id"),
							rs.getLong("gross_minor"), rs.getLong("commission_minor"), rs.getLong("net_minor"),
							rs.getString("currency"),
							reasonToken == null ? null : RefundReason.valueOf(reasonToken),
							toInstant(rs.getTimestamp("created_at")));
				})
				.list();
	}

	private static Instant toInstant(java.sql.Timestamp ts) {
		return ts == null ? null : ts.toInstant();
	}

	@Override
	public List<VenuePeriodTotal> netTotalsForPeriod(PeriodKey period) {
		// Signed net owed per venue for the period: ACCRUAL adds net, REVERSAL subtracts it (invariant
		// #9). Served by payout_ledger_period_idx (V15). MAX(currency) is a single-value pick (EUR-only
		// in v1, invariant #5). Total may be negative when a period's reversals exceed its accruals.
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
						new VenueId(rs.getLong("venue_id")), rs.getLong("net_minor"), rs.getString("currency")))
				.list();
	}

	/** Conflict-free insert shared by accrual and reversal — {@code ON CONFLICT (booking_id, entry_type)}. */
	private void insertIdempotently(PayoutLedgerEntry entry) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency, reason)
				VALUES (:venue, :booking, :type, :gross, :commission, :net, :currency, :reason)
				ON CONFLICT (booking_id, entry_type) DO NOTHING
				""")
				.param("venue", entry.venueId().value())
				.param("booking", entry.bookingId())
				.param("type", entry.entryType().name())
				.param("gross", entry.grossMinor())
				.param("commission", entry.commissionMinor())
				.param("net", entry.netMinor())
				.param("currency", entry.currency())
				.param("reason", entry.reason() == null ? null : entry.reason().name())
				.update();
	}
}
