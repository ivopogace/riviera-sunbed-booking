package ai.riviera.platform.availability.adapter.out;

import java.time.LocalDate;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.availability.application.StaffMarks;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * {@link StaffMarks} over {@link JdbcClient} (invariant #1). A mark is {@code INSERT … ON CONFLICT
 * (set_id, booking_date) DO NOTHING}, the online claim's primitive, so a mark and a claim cannot both win
 * (invariant #2); a release deletes only a {@code STAFF_MARKED} row. No {@code @Transactional}: each write
 * runs in the service's, so a mark shares one transaction with the retired-set lock it follows.
 */
@Repository
class JdbcStaffMarks implements StaffMarks {

	private final JdbcClient jdbc;

	JdbcStaffMarks(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean mark(SetId setId, LocalDate date) {
		int inserted = jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:setId, :date, 'STAFF_MARKED')
				ON CONFLICT (set_id, booking_date) DO NOTHING
				""")
				.param("setId", setId.value())
				.param("date", date)
				.update();
		return inserted == 1;
	}

	@Override
	public boolean release(SetId setId, LocalDate date) {
		int deleted = jdbc.sql("""
				DELETE FROM set_availability
				WHERE set_id = :setId AND booking_date = :date AND state = 'STAFF_MARKED'
				""")
				.param("setId", setId.value())
				.param("date", date)
				.update();
		return deleted == 1;
	}
}
