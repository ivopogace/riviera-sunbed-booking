package ai.riviera.platform.availability.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.api.SetBookingFacts;

/**
 * Staff tap-to-mark writes, the second writer of {@code set_availability} (invariant #2). Ownership (#13) of the
 * path venue is asserted before any set lookup, and a set not on that venue ({@link SetBookingFacts#setBookingInfo})
 * answers as a missing one. Mark takes {@link SetBookingFacts#poolForClaim} (retired → {@code NO_SUCH_SET};
 * pool ignored), refuses a past Europe/Tirane date (#6), then {@code INSERT … ON CONFLICT DO NOTHING} — the
 * online claim's primitive, so a mark and a claim cannot both win. Release deletes only a {@code STAFF_MARKED}
 * row, never {@code BOOKED_ONLINE}.
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
	public MarkOutcome mark(OperatorId operator, VenueId venue, SetId setId, LocalDate date) {
		ownership.assertOwns(operator, new VenueRef(venue.value()));
		if (!isOnVenue(setId, venue)) {
			return MarkOutcome.NO_SUCH_SET;
		}
		if (date.isBefore(LocalDate.ofInstant(clock.instant(), TIRANE))) {
			return MarkOutcome.DATE_IN_PAST;
		}
		// The locked claim-time gate: the facts read above answers for a retired set, this one does not (ADR-0019).
		if (setFacts.poolForClaim(setId).isEmpty()) {
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
	public ReleaseOutcome release(OperatorId operator, VenueId venue, SetId setId, LocalDate date) {
		ownership.assertOwns(operator, new VenueRef(venue.value()));
		if (!isOnVenue(setId, venue)) {
			return ReleaseOutcome.NOT_MARKED;
		}
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

	private boolean isOnVenue(SetId setId, VenueId venue) {
		return setFacts.setBookingInfo(setId).filter(set -> set.venueId().equals(venue)).isPresent();
	}
}
