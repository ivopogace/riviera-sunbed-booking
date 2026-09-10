package ai.riviera.platform.payout.adapter.out;

import java.sql.Date;
import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.application.VenueChangeFeeAmount;
import ai.riviera.platform.payout.application.VenueChangeFeeSetting;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The stored venue-change fee against real Postgres (Testcontainers): what the seeded row answers,
 * what a change puts in force, and the two things a change must never do — reprice a posted
 * {@code FEE} row, or accept an amount the table's own CHECK refuses. JDBC-only (invariant #1);
 * skipped where Docker is absent.
 *
 * <p>The row-missing case is reachable only by hand, and the fallback exists so a database someone
 * has emptied still charges rather than throwing on the money path.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcVenueChangeFeeSettingIT {

	private static final long SEEDED_MINOR = 500L;

	@Autowired
	VenueChangeFeeSetting setting;

	@Autowired
	PayoutLedger ledger;

	@Autowired
	JdbcClient jdbc;

	@AfterEach
	void restoreTheSeededFee() {
		jdbc.sql("""
				INSERT INTO platform_setting (setting_key, amount_minor, currency)
				VALUES ('VENUE_CHANGE_FEE', :amount, 'EUR')
				ON CONFLICT (setting_key) DO UPDATE SET amount_minor = EXCLUDED.amount_minor
				""").param("amount", SEEDED_MINOR).update();
	}

	@Test
	void readsTheSeededRow() {
		VenueChangeFeeAmount fee = setting.current();

		assertEquals(SEEDED_MINOR, fee.minorUnits());
		assertEquals("EUR", fee.currency());
	}

	@Test
	void fallsBackToTheSeedWhenTheRowIsMissing() {
		jdbc.sql("DELETE FROM platform_setting WHERE setting_key = 'VENUE_CHANGE_FEE'").update();

		VenueChangeFeeAmount fee = setting.current();

		assertEquals(SEEDED_MINOR, fee.minorUnits(), "an emptied table still charges the seeded default");
		assertEquals("EUR", fee.currency());
	}

	@Test
	void aChangeIsInForceForTheNextRead() {
		setting.change(700L);

		assertEquals(700L, setting.current().minorUnits());
	}

	@Test
	void aChangeRestoresAHandDeletedRow() {
		jdbc.sql("DELETE FROM platform_setting WHERE setting_key = 'VENUE_CHANGE_FEE'").update();

		setting.change(700L);

		assertEquals(700L, setting.current().minorUnits());
	}

	@Test
	void aChangeNeverRepricesAPostedFee() {
		long bookingId = newBooking();
		ledger.charge(PayoutLedgerEntry.fee(new VenueId(seededVenueId()), bookingId, SEEDED_MINOR, "EUR"));

		setting.change(700L);

		assertEquals(SEEDED_MINOR, postedFeeMinor(bookingId), "a posted FEE row is history, never repriced");
		assertEquals(700L, setting.current().minorUnits(), "the next charge reads the new amount");
	}

	@Test
	void theTableRefusesAnAmountOutsideItsBound() {
		assertThrows(DataIntegrityViolationException.class, () -> writeRawAmount(-1L));
		assertThrows(DataIntegrityViolationException.class,
				() -> writeRawAmount(VenueChangeFeeAmount.MAX_FEE_MINOR + 1));
	}

	@Test
	void theTableRefusesAnUnknownSettingKey() {
		assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("""
				INSERT INTO platform_setting (setting_key, amount_minor, currency)
				VALUES ('SOMETHING_ELSE', 100, 'EUR')
				""").update());
	}

	private void writeRawAmount(long minorUnits) {
		jdbc.sql("UPDATE platform_setting SET amount_minor = :amount WHERE setting_key = 'VENUE_CHANGE_FEE'")
				.param("amount", minorUnits).update();
	}

	private long postedFeeMinor(long bookingId) {
		return jdbc.sql("SELECT net_minor FROM payout_ledger_entry WHERE booking_id = :booking AND entry_type = 'FEE'")
				.param("booking", bookingId).query(Long.class).single();
	}

	private long seededVenueId() {
		return jdbc.sql("SELECT id FROM venue WHERE name = 'Miramar Beach Club'").query(Long.class).single();
	}

	private long newBooking() {
		long venueId = seededVenueId();
		long setId = jdbc.sql("SELECT id FROM set_position WHERE venue_id = :venue ORDER BY id LIMIT 1")
				.param("venue", venueId).query(Long.class).single();
		long customerId = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:email, 'Fee Setting Guest', '+355691110901')
				RETURNING id
				""").param("email", "fee-setting-" + System.nanoTime() + "@example.test")
				.query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :customer, :date, 4500, 'EUR', 'CANCELLED')
				RETURNING id
				""")
				.param("code", "FEE" + System.nanoTime() % 100000000L)
				.param("venue", venueId).param("set", setId).param("customer", customerId)
				.param("date", Date.valueOf(LocalDate.of(2026, 8, 1)))
				.query(Long.class).single();
	}
}
