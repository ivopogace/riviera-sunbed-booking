package ai.riviera.platform.payout.infrastructure.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payout.application.out.PayoutLedger;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
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
