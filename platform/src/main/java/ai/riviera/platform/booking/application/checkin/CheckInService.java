package ai.riviera.platform.booking.application.checkin;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The check-in use case (#583). Per-venue authorization first (invariant #13):
 * {@link VenueOwnership#assertOwns} on the acting operator, before any code lookup, so denial
 * discloses nothing. Then the guarded {@code CONFIRMED → COMPLETED} transition, scoped to today in
 * {@code Europe/Tirane} (invariant #6); a 0-row miss is classified against committed state — after
 * the {@code UPDATE}, so a lost race reads the winner's {@code COMPLETED} and answers
 * {@link CheckInResult.AlreadyCheckedIn}, never a double transition. Publishes no event: nothing
 * accrues and nothing refunds (the withdraw precedent).
 */
@Service
class CheckInService implements CheckInBooking {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Bookings bookings;
	private final VenueOwnership ownership;
	private final Clock clock;

	CheckInService(Bookings bookings, VenueOwnership ownership, Clock clock) {
		this.bookings = bookings;
		this.ownership = ownership;
		this.clock = clock;
	}

	@Override
	@Transactional
	public CheckInResult checkIn(OperatorId operator, VenueId venueId, String code) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		Instant now = clock.instant();
		LocalDate today = LocalDate.ofInstant(now, TIRANE);
		return bookings.completeConfirmed(code, venueId, today, now)
				.<CheckInResult>map(done -> new CheckInResult.CheckedIn(done.setId(), done.bookingDate()))
				.orElseGet(() -> classify(code, venueId));
	}

	private CheckInResult classify(String code, VenueId venueId) {
		return bookings.findCheckInFacts(code, venueId)
				.<CheckInResult>map(facts -> switch (facts.status()) {
					case COMPLETED -> new CheckInResult.AlreadyCheckedIn(facts.bookingDate());
					case CONFIRMED -> new CheckInResult.WrongServiceDate(facts.bookingDate());
					default -> new CheckInResult.NotFound();
				})
				.orElseGet(CheckInResult.NotFound::new);
	}
}
