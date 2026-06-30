package ai.riviera.platform.availability.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.application.in.MarkOutcome;
import ai.riviera.platform.availability.application.in.ReleaseOutcome;
import ai.riviera.platform.availability.application.in.StaffAvailability;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueCatalog;

/**
 * The staff tap-to-mark write path (U8) — the second writer onto {@code set_availability}
 * (invariant #2), package-private behind {@link StaffAvailability}. Explicit SQL via
 * {@link JdbcClient}, no JPA (invariant #1).
 *
 * <p><strong>Mark</strong> is three steps in one transaction: (1) reject a date before today in
 * {@code Europe/Tirane} (invariant #6 — reasoned via the injected UTC {@link Clock}, never the JVM
 * zone); (2) confirm the set exists via {@link VenueCatalog#poolOf} (venue's {@code api/} port, not
 * its tables — invariant #11) so a bad id is a typed {@code NO_SUCH_SET}, not an FK exception; (3)
 * an atomic {@code INSERT ... ON CONFLICT (set_id, booking_date) DO NOTHING}. Rows-affected decides
 * the winner ({@code 1} = {@code MARKED}, {@code 0} = {@code ALREADY_TAKEN}) — the same single-
 * statement concurrency primitive the online claim uses against the {@code UNIQUE} index, so a
 * staff mark racing an online claim for one {@code (set, date)} cannot both win.
 *
 * <p>Unlike the online claim this is <strong>pool-agnostic</strong> (issue #10): any free set may
 * be marked, including an online-pool one — marking it is exactly what removes it from the online
 * pool for the day.
 *
 * <p><strong>Release</strong> is a single guarded {@code DELETE} of a {@code STAFF_MARKED} row only;
 * an online {@code BOOKED_ONLINE} row is never deleted (invariant #2). 0 rows ⇒ {@code NOT_MARKED}.
 */
@Service
class StaffAvailabilityService implements StaffAvailability {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final JdbcClient jdbc;
	private final VenueCatalog venueCatalog;
	private final Clock clock;

	StaffAvailabilityService(JdbcClient jdbc, VenueCatalog venueCatalog, Clock clock) {
		this.jdbc = jdbc;
		this.venueCatalog = venueCatalog;
		this.clock = clock;
	}

	@Override
	@Transactional
	public MarkOutcome mark(SetId setId, LocalDate date) {
		if (date.isBefore(LocalDate.ofInstant(clock.instant(), TIRANE))) {
			return MarkOutcome.DATE_IN_PAST;
		}
		if (venueCatalog.poolOf(setId).isEmpty()) {
			return MarkOutcome.NO_SUCH_SET;
		}
		int inserted = jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:setId, :date, 'STAFF_MARKED')
				ON CONFLICT (set_id, booking_date) DO NOTHING
				""")
				.param("setId", setId.value())
				.param("date", date)
				.update();
		return inserted == 1 ? MarkOutcome.MARKED : MarkOutcome.ALREADY_TAKEN;
	}

	@Override
	@Transactional
	public ReleaseOutcome release(SetId setId, LocalDate date) {
		// Delete only a staff mark — never an online claim's row (invariant #2). 0 rows ⇒ NOT_MARKED.
		int deleted = jdbc.sql("""
				DELETE FROM set_availability
				WHERE set_id = :setId AND booking_date = :date AND state = 'STAFF_MARKED'
				""")
				.param("setId", setId.value())
				.param("date", date)
				.update();
		return deleted == 1 ? ReleaseOutcome.RELEASED : ReleaseOutcome.NOT_MARKED;
	}
}
