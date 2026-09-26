package ai.riviera.platform.availability.adapter.out;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.api.SetBookingFacts;

/**
 * {@link AvailabilityClaim} over {@link JdbcClient} (invariant #1): one transaction, two steps. First
 * the set's pool through {@link SetBookingFacts} (invariant #11) as a <em>locking</em> read: the pool
 * is mutable layout, and an unlocked read lets a pool flip land between check and claim (#3). Then
 * {@code INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING}: 1 row is {@code CLAIMED}, 0 is
 * {@code ALREADY_TAKEN}. That statement is the whole concurrency primitive (invariant #2); no
 * {@code SELECT … FOR UPDATE} is needed, because creating the row is the claim.
 */
@Repository
class JdbcAvailabilityClaim implements AvailabilityClaim {

	private final JdbcClient jdbc;
	private final SetBookingFacts setFacts;

	JdbcAvailabilityClaim(JdbcClient jdbc, SetBookingFacts setFacts) {
		this.jdbc = jdbc;
		this.setFacts = setFacts;
	}

	@Override
	@Transactional
	public ClaimOutcome claim(SetId setId, LocalDate bookingDate) {
		Optional<Pool> pool = setFacts.poolForClaim(setId);
		if (pool.isEmpty()) {
			return ClaimOutcome.NO_SUCH_SET;
		}
		if (pool.get() != Pool.ONLINE) {
			return ClaimOutcome.NOT_ONLINE_POOL;
		}

		int inserted = jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:setId, :bookingDate, 'BOOKED_ONLINE')
				ON CONFLICT (set_id, booking_date) DO NOTHING
				""")
				.param("setId", setId.value())
				.param("bookingDate", bookingDate)
				.update();

		return inserted == 1 ? ClaimOutcome.CLAIMED : ClaimOutcome.ALREADY_TAKEN;
	}

	@Override
	@Transactional
	public void release(SetId setId, LocalDate bookingDate) {
		// Delete only an online claim — never a staff-marked row. Frees the (set, date) so it is
		// re-claimable (invariant #2). A no-op (0 rows) if nothing online holds it.
		jdbc.sql("""
				DELETE FROM set_availability
				WHERE set_id = :setId AND booking_date = :bookingDate AND state = 'BOOKED_ONLINE'
				""")
				.param("setId", setId.value())
				.param("bookingDate", bookingDate)
				.update();
	}
}
