package ai.riviera.platform.payout;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payout.application.BatchStatusOutcome;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * AC-2/AC-3/AC-7 (issue #12): the weekly BKT report generates one persisted {@link PayoutBatch} per
 * venue for a period with {@code total = Σ(ACCRUAL.net) − Σ(REVERSAL.net)} (integer minor units),
 * starts batches {@code DRAFT}, is idempotent on re-generation (refreshes a draft, freezes a
 * reported/settled one), and advances status DRAFT→REPORTED→SETTLED while rejecting illegal moves.
 * Entries are inserted with explicit, test-unique {@code period_key}s so each case is isolated on the
 * shared container. Testcontainers; skipped without Docker.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutBatchGenerationIT {

	@Autowired
	PayoutReport payoutReport;

	@Autowired
	JdbcClient jdbc;

	private long newVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Batch Test Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
	}

	/** Reuse a seeded set as the booking's set FK (independent from venue_id) — avoids inserting
	 *  set_position rows that would pollute other tests' global set queries. */
	private long anySeededSet() {
		return jdbc.sql("SELECT id FROM set_position ORDER BY id LIMIT 1").query(Long.class).single();
	}

	private long newBooking(long venueId, String code) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 10000, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", anySeededSet())
				.param("cust", customer).param("date", LocalDate.of(2031, 1, 1))
				.query(Long.class).single();
	}

	/** Insert a ledger entry with an explicit period_key (overriding the NOW()-based default) for isolation. */
	private void entry(long venueId, long bookingId, String type, long netMinor, String period, String reason) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency, period_key, reason)
				VALUES (:v, :b, :type, :net, 0, :net, 'EUR', :period, :reason)
				""")
				.param("v", venueId).param("b", bookingId).param("type", type).param("net", netMinor)
				.param("period", period).param("reason", reason).update();
	}

	private void accrual(long venueId, long bookingId, long net, String period) {
		entry(venueId, bookingId, "ACCRUAL", net, period, null);
	}

	private void reversal(long venueId, long bookingId, long net, String period) {
		entry(venueId, bookingId, "REVERSAL", net, period, "POLICY");
	}

	private PayoutBatch batchFor(List<PayoutBatch> batches, long venueId) {
		return batches.stream().filter(b -> b.venueId().value() == venueId).findFirst().orElseThrow();
	}

	@Test
	void groupsByVenueAndPeriod() {
		PeriodKey period = PeriodKey.of("2099-W52");
		long venueA = newVenue();
		long venueB = newVenue();
		accrual(venueA, newBooking(venueA, "BATCHA1"), 8500L, period.value());
		long bookingB = newBooking(venueB, "BATCHB1");
		accrual(venueB, bookingB, 3000L, period.value());
		reversal(venueB, bookingB, 1000L, period.value());

		List<PayoutBatch> batches = payoutReport.generate(period);

		List<PayoutBatch> mine = batches.stream()
				.filter(b -> b.venueId().value() == venueA || b.venueId().value() == venueB).toList();
		assertEquals(2, mine.size(), "one batch per venue with activity in the period");
		assertEquals(8500L, batchFor(batches, venueA).totalNetMinor(), "venue A net = 8500");
		assertEquals(2000L, batchFor(batches, venueB).totalNetMinor(), "venue B net = 3000 - 1000");
		assertEquals(BatchStatus.DRAFT, batchFor(batches, venueA).status(), "new batches are DRAFT");
	}

	@Test
	void regenerateIsIdempotent() {
		PeriodKey period = PeriodKey.of("2099-W51");
		long venue = newVenue();
		accrual(venue, newBooking(venue, "BATCHRG1"), 5000L, period.value());

		payoutReport.generate(period);
		accrual(venue, newBooking(venue, "BATCHRG2"), 2000L, period.value()); // late entry
		payoutReport.generate(period); // refresh

		List<PayoutBatch> after = payoutReport.forPeriod(period).stream()
				.filter(b -> b.venueId().value() == venue).toList();
		assertEquals(1, after.size(), "still exactly one batch per venue (no duplicate)");
		assertEquals(7000L, after.getFirst().totalNetMinor(), "the DRAFT total is refreshed to 5000 + 2000");
	}

	@Test
	void lifecycleAdvancesAndFreezesReported() {
		PeriodKey period = PeriodKey.of("2099-W50");
		long venue = newVenue();
		accrual(venue, newBooking(venue, "BATCHLC1"), 4000L, period.value());
		long batchId = batchFor(payoutReport.generate(period), venue).id();

		// DRAFT -> REPORTED
		BatchStatusOutcome reported = payoutReport.mark(batchId, BatchStatus.REPORTED);
		assertEquals(BatchStatus.REPORTED,
				assertInstanceOf(BatchStatusOutcome.Marked.class, reported).batch().status());

		// A reported batch is frozen against re-generation — and re-generating after later ledger
		// activity warns the operator that the frozen total now diverges (plan R-5).
		accrual(venue, newBooking(venue, "BATCHLC2"), 1000L, period.value());
		ch.qos.logback.classic.Logger reportLog = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory
				.getLogger("ai.riviera.platform.payout.application.PayoutReportService");
		ListAppender<ILoggingEvent> appender = new ListAppender<>();
		appender.start();
		reportLog.addAppender(appender);
		try {
			payoutReport.generate(period);
		}
		finally {
			reportLog.detachAppender(appender);
		}
		assertEquals(4000L, batchFor(payoutReport.forPeriod(period), venue).totalNetMinor(),
				"a REPORTED batch is not overwritten by a re-generate (frozen)");
		assertTrue(appender.list.stream()
						.anyMatch(e -> e.getLevel() == Level.WARN && e.getFormattedMessage().contains("frozen")),
				"re-generating a stale frozen batch warns the operator to reconcile manually");

		// REPORTED -> SETTLED
		assertInstanceOf(BatchStatusOutcome.Marked.class, payoutReport.mark(batchId, BatchStatus.SETTLED));
	}

	@Test
	void rejectsIllegalTransitionAndUnknownBatch() {
		PeriodKey period = PeriodKey.of("2099-W49");
		long venue = newVenue();
		accrual(venue, newBooking(venue, "BATCHIT1"), 4000L, period.value());
		long draftId = batchFor(payoutReport.generate(period), venue).id();

		assertInstanceOf(BatchStatusOutcome.IllegalTransition.class,
				payoutReport.mark(draftId, BatchStatus.SETTLED), "cannot settle a DRAFT directly");
		assertInstanceOf(BatchStatusOutcome.NotFound.class,
				payoutReport.mark(999_999_999L, BatchStatus.REPORTED), "unknown batch id");
	}

	@Test
	void emptyPeriodGeneratesNothing() {
		assertEquals(0, payoutReport.generate(PeriodKey.of("2099-W01")).size(),
				"a period with no ledger activity generates no batches");
		assertEquals(0, payoutReport.forPeriod(PeriodKey.of("2099-W01")).size(), "and none to read back");
	}
}
