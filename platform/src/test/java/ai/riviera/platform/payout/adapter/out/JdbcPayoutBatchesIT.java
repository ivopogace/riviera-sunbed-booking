package ai.riviera.platform.payout.adapter.out;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payout.application.PayoutBatches;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the {@code payout} batch persistence adapter against real Postgres (Testcontainers):
 * the status transition is guarded on the expected prior status <em>in the one statement</em>, so a
 * caller acting on a stale read cannot regress a batch (invariant #9), and the row it returns is
 * the row as persisted. JDBC-only (invariant #1); skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcPayoutBatchesIT {

	@Autowired
	PayoutBatches batches;

	@Autowired
	JdbcClient jdbc;

	private long newVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Batch Adapter Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
	}

	private long newBatch(String period, BatchStatus status) {
		return jdbc.sql("""
				INSERT INTO payout_batch (venue_id, period_key, total_net_minor, currency, status)
				VALUES (:venue, :period, 4000, 'EUR', :status)
				RETURNING id
				""")
				.param("venue", newVenue()).param("period", period).param("status", status.name())
				.query(Long.class).single();
	}

	private BatchStatus statusOf(long batchId) {
		return BatchStatus.valueOf(jdbc.sql("SELECT status FROM payout_batch WHERE id = :id")
				.param("id", batchId).query(String.class).single());
	}

	@Test
	void staleTransitionCannotRegressStatus() {
		long batchId = newBatch("2098-W48", BatchStatus.SETTLED);

		Optional<PayoutBatch> stale = batches.transition(batchId, BatchStatus.DRAFT, BatchStatus.REPORTED);

		assertTrue(stale.isEmpty(), "a transition whose expected status no longer holds must write nothing");
		assertEquals(BatchStatus.SETTLED, statusOf(batchId), "a settled batch is never regressed by a stale write");
	}

	@Test
	void matchingTransitionReturnsThePersistedRow() {
		long batchId = newBatch("2098-W47", BatchStatus.DRAFT);

		PayoutBatch moved = batches.transition(batchId, BatchStatus.DRAFT, BatchStatus.REPORTED).orElseThrow();

		assertEquals(BatchStatus.REPORTED, moved.status(), "the returned row carries the new status");
		assertEquals(4000L, moved.totalNetMinor(), "and the rest of the row as persisted");
		assertEquals(BatchStatus.REPORTED, statusOf(batchId));
	}

	@Test
	void anUnknownBatchTransitionsNothing() {
		assertTrue(batches.transition(999_999_999L, BatchStatus.DRAFT, BatchStatus.REPORTED).isEmpty(),
				"no row, no write, no phantom result");
	}
}
