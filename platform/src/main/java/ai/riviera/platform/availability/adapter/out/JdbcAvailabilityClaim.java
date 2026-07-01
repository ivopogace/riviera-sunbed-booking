package ai.riviera.platform.availability.adapter.out;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.api.SetBookingFacts;

/**
 * JDBC adapter implementing {@link AvailabilityClaim} directly (no intervening application
 * service / out-port — a single adapter is a hypothetical seam, not a real one; mirrors
 * {@code JdbcVenueCatalog}). Invariant #1: explicit SQL via {@link JdbcClient}, no JPA.
 *
 * <p>The claim is two steps in one transaction:
 * <ol>
 *   <li>look up the set's pool through {@link SetBookingFacts} (venue's {@code api/} port, not
 *       its tables — invariant #11). Pool is immutable layout data, so check-then-claim has
 *       no meaningful race.</li>
 *   <li>an atomic {@code INSERT ... ON CONFLICT (set_id, booking_date) DO NOTHING} against
 *       the {@code UNIQUE} constraint. Rows-affected decides the winner: {@code 1} =
 *       {@code CLAIMED}, {@code 0} = a concurrent/earlier claim already holds it
 *       ({@code ALREADY_TAKEN}). This single statement is the entire concurrency primitive
 *       (invariant #2) — no {@code SELECT ... FOR UPDATE} needed because the row's creation
 *       is the claim.</li>
 * </ol>
 */
@Repository
class JdbcAvailabilityClaim implements AvailabilityClaim {

	private static final String ONLINE_POOL = "ONLINE";

	private final JdbcClient jdbc;
	private final SetBookingFacts setFacts;

	JdbcAvailabilityClaim(JdbcClient jdbc, SetBookingFacts setFacts) {
		this.jdbc = jdbc;
		this.setFacts = setFacts;
	}

	@Override
	@Transactional
	public ClaimOutcome claim(SetId setId, LocalDate bookingDate) {
		Optional<String> pool = setFacts.poolOf(setId);
		if (pool.isEmpty()) {
			return ClaimOutcome.NO_SUCH_SET;
		}
		if (!ONLINE_POOL.equals(pool.get())) {
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
