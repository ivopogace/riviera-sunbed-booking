package ai.riviera.platform.payout.adapter.out;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payout.application.PayoutBatches;
import ai.riviera.platform.payout.application.VenuePeriodTotal;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * JDBC adapter for {@link PayoutBatches} — explicit SQL via {@link JdbcClient}, no JPA (invariant #1).
 * Package-private; only the port is referenced cross-layer.
 *
 * <p>Both writes are guarded on {@code status} in the one statement, so neither can act on a stale
 * read (invariant #9). {@link #upsertDraft} is an idempotent
 * {@code INSERT … ON CONFLICT (venue_id, period_key) DO UPDATE} guarded by
 * {@code WHERE payout_batch.status = 'DRAFT'}: a re-generated period refreshes a still-draft batch's
 * total but never overwrites one already {@code REPORTED}/{@code SETTLED}. {@link #transition} pins
 * the expected prior status in its own {@code WHERE}, so a batch never moves backwards.
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
	public Optional<PayoutBatch> transition(long id, BatchStatus expected, BatchStatus target) {
		return jdbc.sql("""
				UPDATE payout_batch
				SET status = :target, updated_at = NOW()
				WHERE id = :id AND status = :expected
				RETURNING id, venue_id, period_key, total_net_minor, currency, status
				""")
				.param("target", target.name())
				.param("id", id)
				.param("expected", expected.name())
				.query(BATCH_MAPPER)
				.optional();
	}

	private static final RowMapper<PayoutBatch> BATCH_MAPPER =
			(rs, rowNum) -> new PayoutBatch(rs.getLong("id"), new VenueId(rs.getLong("venue_id")),
					new PeriodKey(rs.getString("period_key")), rs.getLong("total_net_minor"),
					rs.getString("currency"), BatchStatus.valueOf(rs.getString("status")));
}
