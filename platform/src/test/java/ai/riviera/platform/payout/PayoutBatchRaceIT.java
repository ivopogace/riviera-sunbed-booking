package ai.riviera.platform.payout;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payout.application.BatchStatusOutcome;
import ai.riviera.platform.payout.application.PayoutBatches;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doReturn;

/**
 * The lost-race path end to end, against real Postgres: a stale pre-read, a real guarded
 * {@code UPDATE} that matches no row, and the re-read that must observe the winner's committed
 * status from inside {@code mark}'s own transaction. The adapter's guard and the service's outcome
 * mapping are each pinned elsewhere ({@code JdbcPayoutBatchesIT}, {@code PayoutReportServiceTest});
 * this is the one test that proves they compose — and the only one that would notice if the
 * transaction stopped running at READ COMMITTED. Testcontainers; skipped without Docker.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutBatchRaceIT {

	private static final PeriodKey PERIOD = PeriodKey.of("2097-W48");

	@Autowired
	PayoutReport payoutReport;

	@Autowired
	JdbcClient jdbc;

	@MockitoSpyBean
	PayoutBatches batches;

	private long settledBatch() {
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Batch Race Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO payout_batch (venue_id, period_key, total_net_minor, currency, status)
				VALUES (:venue, :period, 4000, 'EUR', 'SETTLED')
				RETURNING id
				""")
				.param("venue", venue).param("period", PERIOD.value())
				.query(Long.class).single();
	}

	/** What the loser's pre-read returned before the winner advanced the batch to SETTLED. */
	private PayoutBatch staleDraft(long batchId) {
		return new PayoutBatch(batchId, new VenueId(1), PERIOD, 4000, "EUR", BatchStatus.DRAFT);
	}

	@Test
	void aStaleReadCannotMarkAndLearnsTheRealStatus() {
		long batchId = settledBatch();
		doReturn(Optional.of(staleDraft(batchId))).doCallRealMethod().when(batches).findById(batchId);

		BatchStatusOutcome outcome = payoutReport.mark(batchId, BatchStatus.REPORTED);

		BatchStatusOutcome.IllegalTransition illegal =
				assertInstanceOf(BatchStatusOutcome.IllegalTransition.class, outcome,
						"a stale DRAFT read must not mark a SETTLED batch REPORTED");
		assertEquals(BatchStatus.SETTLED, illegal.from(),
				"the re-read inside mark's transaction sees the committed SETTLED, not the stale DRAFT");
		assertEquals(BatchStatus.REPORTED, illegal.to());
		assertEquals("SETTLED", jdbc.sql("SELECT status FROM payout_batch WHERE id = :id")
				.param("id", batchId).query(String.class).single(), "and the row is untouched");
	}

	@Test
	void aStaleReadLosingToTheSameTargetIsStillMarked() {
		long batchId = settledBatch();
		jdbc.sql("UPDATE payout_batch SET status = 'REPORTED' WHERE id = :id").param("id", batchId).update();
		doReturn(Optional.of(staleDraft(batchId))).doCallRealMethod().when(batches).findById(batchId);

		BatchStatusOutcome outcome = payoutReport.mark(batchId, BatchStatus.REPORTED);

		BatchStatusOutcome.Marked marked = assertInstanceOf(BatchStatusOutcome.Marked.class, outcome,
				"losing the race to the very target requested is not an error");
		assertEquals(BatchStatus.REPORTED, marked.batch().status());
	}

	@Test
	void anUncontendedMarkStillSucceeds() {
		long batchId = settledBatch();
		jdbc.sql("UPDATE payout_batch SET status = 'DRAFT' WHERE id = :id").param("id", batchId).update();
		doCallRealMethod().when(batches).findById(batchId);

		BatchStatusOutcome outcome = payoutReport.mark(batchId, BatchStatus.REPORTED);

		assertEquals(BatchStatus.REPORTED,
				assertInstanceOf(BatchStatusOutcome.Marked.class, outcome).batch().status());
	}
}
