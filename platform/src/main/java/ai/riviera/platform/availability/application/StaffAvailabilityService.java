package ai.riviera.platform.availability.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.api.VenueRef;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.SetBookingFacts;

/**
 * The staff tap-to-mark write path (U8) — the second writer onto {@code set_availability}
 * (invariant #2), package-private behind {@link StaffAvailability}. Explicit SQL via
 * {@link JdbcClient}, no JPA (invariant #1).
 *
 * <p><strong>Per-venue authorization (invariant #13, issue #73):</strong> a set id is globally
 * unique, so the owning venue is resolved from {@code setId} via {@link SetBookingFacts#setBookingInfo}
 * (venue's {@code api/} port, not its tables — invariant #11) and the operator is checked against
 * <em>that</em> venue via {@link VenueOwnership#assertOwns} — never the decorative path
 * {@code venueId}, which an operator could otherwise spoof to reach a set they don't own. A set that
 * does not exist can carry no ownership, so it resolves to {@code NO_SUCH_SET} (mark) /
 * {@code NOT_MARKED} (release) before the check; this reveals only set existence, never another
 * venue's data.
 *
 * <p><strong>Mark</strong> in one transaction: resolve the set (→ {@code NO_SUCH_SET} if unknown),
 * assert ownership, reject a date before today in {@code Europe/Tirane} (invariant #6 — reasoned via
 * the injected UTC {@link Clock}, never the JVM zone), then an atomic
 * {@code INSERT ... ON CONFLICT (set_id, booking_date) DO NOTHING}. Rows-affected decides the winner
 * ({@code 1} = {@code MARKED}, {@code 0} = {@code ALREADY_TAKEN}) — the same single-statement
 * concurrency primitive the online claim uses against the {@code UNIQUE} index, so a staff mark
 * racing an online claim for one {@code (set, date)} cannot both win.
 *
 * <p>Unlike the online claim this is <strong>pool-agnostic</strong> (issue #10): any free set may
 * be marked, including an online-pool one — marking it is exactly what removes it from the online
 * pool for the day.
 *
 * <p><strong>Release</strong> resolves + asserts ownership, then a single guarded {@code DELETE} of a
 * {@code STAFF_MARKED} row only; an online {@code BOOKED_ONLINE} row is never deleted (invariant #2).
 * 0 rows ⇒ {@code NOT_MARKED}.
 */
@Service
class StaffAvailabilityService implements StaffAvailability {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final JdbcClient jdbc;
	private final SetBookingFacts setFacts;
	private final VenueOwnership ownership;
	private final Clock clock;

	StaffAvailabilityService(JdbcClient jdbc, SetBookingFacts setFacts, VenueOwnership ownership,
			Clock clock) {
		this.jdbc = jdbc;
		this.setFacts = setFacts;
		this.ownership = ownership;
		this.clock = clock;
	}

	@Override
	@Transactional
	public MarkOutcome mark(OperatorId operator, SetId setId, LocalDate date) {
		Optional<SetBookingInfo> set = setFacts.setBookingInfo(setId);
		if (set.isEmpty()) {
			return MarkOutcome.NO_SUCH_SET;
		}
		ownership.assertOwns(operator, new VenueRef(set.get().venueId().value()));
		if (date.isBefore(LocalDate.ofInstant(clock.instant(), TIRANE))) {
			return MarkOutcome.DATE_IN_PAST;
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
	public ReleaseOutcome release(OperatorId operator, SetId setId, LocalDate date) {
		Optional<SetBookingInfo> set = setFacts.setBookingInfo(setId);
		if (set.isEmpty()) {
			return ReleaseOutcome.NOT_MARKED; // nothing (and no venue) to act on — a safe no-op
		}
		ownership.assertOwns(operator, new VenueRef(set.get().venueId().value()));
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
