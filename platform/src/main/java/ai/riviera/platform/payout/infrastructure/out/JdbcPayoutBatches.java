package ai.riviera.platform.payout.infrastructure.out;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payout.application.out.PayoutBatches;
import ai.riviera.platform.payout.application.out.VenuePeriodTotal;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.venue.api.VenueId;

/**
 * JDBC adapter for {@link PayoutBatches} — explicit SQL via {@link JdbcClient}, no JPA (invariant #1).
 * Package-private; only the port is referenced cross-layer.
 *
 * <p>{@link #upsertDraft} is an idempotent {@code INSERT … ON CONFLICT (venue_id, period_key) DO UPDATE}
 * guarded by {@code WHERE payout_batch.status = 'DRAFT'}: a re-generated period refreshes a still-draft
 * batch's total but never overwrites one already {@code REPORTED}/{@code SETTLED} (invariant #9).
 */
@Repository
class JdbcPayoutBatches implements PayoutBatches {

	private final JdbcClient jdbc;

	JdbcPayoutBatches(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void upsertDraft(VenuePeriodTotal total, PeriodKey period) {
		jdbc.sql("""
				INSERT INTO payout_batch (venue_id, period_key, total_net_minor, currency, status)
				VALUES (:venue, :period, :total, :currency, 'DRAFT')
				ON CONFLICT (venue_id, period_key) DO UPDATE
				    SET total_net_minor = EXCLUDED.total_net_minor,
				        currency        = EXCLUDED.currency,
				        updated_at      = NOW()
				    WHERE payout_batch.status = 'DRAFT'
				""")
				.param("venue", total.venueId().value())
				.param("period", period.value())
				.param("total", total.netMinor())
				.param("currency", total.currency())
				.update();
	}

	@Override
	public List<PayoutBatch> forPeriod(PeriodKey period) {
		return jdbc.sql("""
				SELECT id, venue_id, period_key, total_net_minor, currency, status
				FROM payout_batch
				WHERE period_key = :period
				ORDER BY venue_id
				""")
				.param("period", period.value())
				.query(BATCH_MAPPER)
				.list();
	}

	@Override
	public Optional<PayoutBatch> findById(long id) {
		return jdbc.sql("""
				SELECT id, venue_id, period_key, total_net_minor, currency, status
				FROM payout_batch
				WHERE id = :id
				""")
				.param("id", id)
				.query(BATCH_MAPPER)
				.optional();
	}

	@Override
	public void updateStatus(long id, BatchStatus status) {
		jdbc.sql("UPDATE payout_batch SET status = :status, updated_at = NOW() WHERE id = :id")
				.param("status", status.name())
				.param("id", id)
				.update();
	}

	private static final org.springframework.jdbc.core.RowMapper<PayoutBatch> BATCH_MAPPER =
			(rs, rowNum) -> new PayoutBatch(rs.getLong("id"), new VenueId(rs.getLong("venue_id")),
					new PeriodKey(rs.getString("period_key")), rs.getLong("total_net_minor"),
					rs.getString("currency"), BatchStatus.valueOf(rs.getString("status")));
}
