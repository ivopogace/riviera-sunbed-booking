package ai.riviera.platform.payout.infrastructure.out;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payout.application.out.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;

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
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency)
				VALUES (:venue, :booking, :type, :gross, :commission, :net, :currency)
				ON CONFLICT (booking_id, entry_type) DO NOTHING
				""")
				.param("venue", entry.venueId().value())
				.param("booking", entry.bookingId())
				.param("type", entry.entryType().name())
				.param("gross", entry.grossMinor())
				.param("commission", entry.commissionMinor())
				.param("net", entry.netMinor())
				.param("currency", entry.currency())
				.update();
	}
}
