package ai.riviera.platform.payout;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.payout.application.in.LedgerEntryView;
import ai.riviera.platform.payout.application.in.VenueLedger;
import ai.riviera.platform.payout.application.in.ViewPayoutLedger;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.venue.api.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * AC-1 (issue #12): the per-venue payout ledger read returns every entry oldest-first with the
 * <strong>running net owed</strong>, and the total net owed = {@code Σ(ACCRUAL.net) − Σ(REVERSAL.net)}
 * (invariant #9), all in integer minor units (invariant #5). Uses a dedicated venue so the per-venue
 * sum is isolated from other tests on the shared container. Testcontainers; skipped without Docker.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutLedgerViewIT {

	@Autowired
	ViewPayoutLedger viewPayoutLedger;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	OperatorDirectory operators;

	/** The interim bootstrap operator (owns every venue) — resolves the ownership guard (#73). */
	private OperatorId bootstrap() {
		return operators.operatorFor("operator").orElseThrow();
	}

	private long newVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Ledger Test Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
	}

	/** Reuse an existing seeded set as the booking's set FK — booking.set_id and booking.venue_id are
	 *  independent FKs, so this avoids inserting set_position rows that would pollute global queries. */
	private long anySeededSet() {
		return jdbc.sql("SELECT id FROM set_position ORDER BY id LIMIT 1").query(Long.class).single();
	}

	private long newBooking(long venueId, long setId, String code) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 10000, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", LocalDate.of(2031, 6, 1))
				.query(Long.class).single();
	}

	@Test
	void runningNetOwed() {
		long venueId = newVenue();
		long bookingId = newBooking(venueId, anySeededSet(), "LEDGERVIEW1");
		// Accrual net 8500 (gross 10000, commission 1500), then a partial reversal net 4250.
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency)
				VALUES (:v, :b, 'ACCRUAL', 10000, 1500, 8500, 'EUR')
				""").param("v", venueId).param("b", bookingId).update();
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency, reason)
				VALUES (:v, :b, 'REVERSAL', 5000, 750, 4250, 'EUR', 'POLICY')
				""").param("v", venueId).param("b", bookingId).update();

		VenueLedger ledger = viewPayoutLedger.forVenue(bootstrap(), new VenueId(venueId));

		assertEquals(4250L, ledger.netOwedMinor(), "net owed = 8500 accrued - 4250 reversed");
		assertEquals("EUR", ledger.currency());
		List<LedgerEntryView> entries = ledger.entries();
		assertEquals(2, entries.size(), "both entries are listed");

		LedgerEntryView accrual = entries.get(0);
		assertEquals(EntryType.ACCRUAL, accrual.entryType(), "accrual comes first (oldest)");
		assertEquals(8500L, accrual.netMinor());
		assertEquals(8500L, accrual.runningNetMinor(), "running net owed after the accrual");
		assertNull(accrual.reason(), "an accrual has no refund reason");

		LedgerEntryView reversal = entries.get(1);
		assertEquals(EntryType.REVERSAL, reversal.entryType());
		assertEquals(4250L, reversal.netMinor());
		assertEquals(4250L, reversal.runningNetMinor(), "running net owed after the reversal");
	}

	@Test
	void emptyLedgerOwesNothing() {
		long venueId = newVenue();

		VenueLedger ledger = viewPayoutLedger.forVenue(bootstrap(), new VenueId(venueId));

		assertEquals(0L, ledger.netOwedMinor(), "a venue with no entries is owed nothing");
		assertEquals(0, ledger.entries().size());
	}
}
