package ai.riviera.platform.booking;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Moves a confirmed booking's service day into the past, so an IT can exercise a stay the guest
 * could already have consumed. The create path enforces the cutoff, so a past-dated booking cannot
 * be made through it — only by moving one after the fact.
 *
 * <p>Shared by the cancel and controller ITs rather than copied into each: this is the most delicate
 * fixture in the fence's coverage, and two copies would drift.
 *
 * <p><strong>Re-run safe on a shared container.</strong> A backdated booking is deliberately never
 * released — that is what the fence asserts — so its {@code set_availability} row survives the test.
 * A second run would then move another row onto the same {@code (set_id, booking_date)} and hit the
 * unique constraint that enforces invariant #2, so any earlier residue at the target date is cleared
 * first.
 *
 * <p>{@code created_at} moves with {@code booking_date}: a real advance booking is
 * created before the date it's for, so an honest fixture backdates both. The mechanism now also
 * serves the abandoned sweep's day-end arm
 * ({@link ai.riviera.platform.booking.application.BookingCutoff#lastEndedServiceDay}).
 */
final class ServiceDayBackdate {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final JdbcClient jdbc;

	ServiceDayBackdate(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Backdate the booking with {@code code} to {@code past}, carrying its held set with it. */
	void moveToPast(String code, LocalDate past) {
		long setId = jdbc.sql("SELECT set_id FROM booking WHERE code = :c")
				.param("c", code).query(Long.class).single();
		clearResidueAt(setId, past);
		jdbc.sql("""
				UPDATE set_availability SET booking_date = :past
				WHERE set_id = :set AND booking_date = (SELECT booking_date FROM booking WHERE code = :c)
				""")
				.param("past", past).param("set", setId).param("c", code).update();
		Instant createdAt = past.atStartOfDay(TIRANE).toInstant().minus(Duration.ofDays(1));
		jdbc.sql("UPDATE booking SET booking_date = :past, created_at = :createdAt WHERE code = :c")
				.param("past", past).param("createdAt", Timestamp.from(createdAt)).param("c", code).update();
	}

	private void clearResidueAt(long setId, LocalDate past) {
		jdbc.sql("DELETE FROM set_availability WHERE set_id = :set AND booking_date = :past")
				.param("set", setId).param("past", past).update();
	}
}
