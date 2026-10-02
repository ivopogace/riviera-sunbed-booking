package ai.riviera.platform.availability.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

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
 * pool ignored) and refuses a past Europe/Tirane date (#6); {@link StaffMarks} then writes in this method's
 * transaction with the online claim's primitive. Release frees only a {@code STAFF_MARKED} row.
 */
@Service
class StaffAvailabilityService implements StaffAvailability {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final StaffMarks marks;
	private final SetBookingFacts setFacts;
	private final VenueOwnership ownership;
	private final Clock clock;

	StaffAvailabilityService(StaffMarks marks, SetBookingFacts setFacts, VenueOwnership ownership,
			Clock clock) {
		this.marks = marks;
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
		return marks.mark(setId, date) ? MarkOutcome.MARKED : MarkOutcome.ALREADY_TAKEN;
	}

	@Override
	@Transactional
	public ReleaseOutcome release(OperatorId operator, VenueId venue, SetId setId, LocalDate date) {
		ownership.assertOwns(operator, new VenueRef(venue.value()));
		if (!isOnVenue(setId, venue)) {
			return ReleaseOutcome.NOT_MARKED;
		}
		return marks.release(setId, date) ? ReleaseOutcome.RELEASED : ReleaseOutcome.NOT_MARKED;
	}

	private boolean isOnVenue(SetId setId, VenueId venue) {
		return setFacts.setBookingInfo(setId).filter(set -> set.venueId().equals(venue)).isPresent();
	}
}
