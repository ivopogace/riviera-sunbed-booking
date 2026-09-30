package ai.riviera.platform.payout;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.LockOrderRace;
import ai.riviera.platform.PausingPorts;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.domain.PeriodKey;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two {@code generate} runs for one period serialize (#1309): a run paused after its ledger read cannot write its
 * older total over a later run's, so the {@code DRAFT} batch ends at the ledger's net.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, PausingPorts.class})
@SpringBootTest
class PayoutGenerateRaceIT {

	private static final PeriodKey PERIOD = PeriodKey.of("2096-W11");

	@Autowired
	PayoutReport payoutReport;
	@Autowired
	JdbcClient jdbc;

	@Test
	void twoGeneratesAroundALedgerCommitLeaveTheLedgersNet() throws Exception {
		long venue = newVenue();
		long booking = newBooking(venue);
		entry(venue, booking, "ACCRUAL", 1000);

		LockOrderRace.Outcome<?, ?> outcome = LockOrderRace.race(jdbc, "netTotalsForPeriod", args -> PERIOD.equals(args[0]),
				() -> payoutReport.generate(PERIOD),
				() -> {
					entry(venue, booking, "REVERSAL", 200);
					return payoutReport.generate(PERIOD);
				});

		assertThat(outcome.racerWaited()).as("the second run waited for the first").isTrue();
		assertThat(jdbc.sql("SELECT total_net_minor FROM payout_batch WHERE venue_id = :v AND period_key = :p")
				.param("v", venue).param("p", PERIOD.value()).query(Long.class).single())
				.as("the ledger now nets 800").isEqualTo(800L);
	}

	private long newVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Generate Race Venue', 'KSAMIL', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
	}

	private long newBooking(long venueId) {
		String code = "GENRACE" + System.nanoTime() % 100_000_000L;
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency, status)
				VALUES (:code, :venue, (SELECT id FROM set_position ORDER BY id LIMIT 1), :cust, :date, 1000, 'EUR',
				        'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("cust", customer)
				.param("date", LocalDate.of(2031, 1, 1)).query(Long.class).single();
	}

	private void entry(long venueId, long bookingId, String type, long net) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor, commission_minor, net_minor,
				                                 currency, period_key, reason)
				VALUES (:v, :b, :type, :net, 0, :net, 'EUR', :period, :reason)
				""")
				.param("v", venueId).param("b", bookingId).param("type", type).param("net", net)
				.param("period", PERIOD.value()).param("reason", "REVERSAL".equals(type) ? "POLICY" : null).update();
	}
}
