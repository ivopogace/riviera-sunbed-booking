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
 * The check-in use case. {@link VenueOwnership#assertOwns} runs first (invariant #13), before any code
 * lookup, so denial discloses nothing; then the guarded stamp on today's service-day row (today in
 * {@code Europe/Tirane}, #6), resolving the stay on its last day. A 0-row miss is classified off the committed
 * row: a lost race {@link CheckInResult.AlreadyCheckedIn}, a swept {@code NO_SHOW} {@link CheckInResult.WrongServiceDate},
 * a refunded day {@link CheckInResult.DayRefunded}, a released one {@link CheckInResult.DayReleased} (ADR-0026,
 * ADR-0027). Rationale: RESPONSIBILITIES.md §booking.
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
				.orElseGet(() -> classify(code, venueId, today));
	}

	private CheckInResult classify(String code, VenueId venueId, LocalDate today) {
		return bookings.findCheckInFacts(code, venueId, today)
				.<CheckInResult>map(facts -> {
					if (facts.refundedToday() && facts.status().stormDayRefundable()) {
						return facts.releasedToday()
								? new CheckInResult.DayReleased(facts.bookingDate(), facts.setId())
								: new CheckInResult.DayRefunded(facts.bookingDate(), facts.setId());
					}
					return switch (facts.status()) {
						case COMPLETED -> new CheckInResult.AlreadyCheckedIn(facts.bookingDate(), facts.setId());
						case CONFIRMED -> facts.attendedToday()
								? new CheckInResult.AlreadyCheckedIn(facts.bookingDate(), facts.setId())
								: new CheckInResult.WrongServiceDate(facts.bookingDate());
						case NO_SHOW -> new CheckInResult.WrongServiceDate(facts.bookingDate());
						default -> new CheckInResult.NotFound();
					};
				})
				.orElseGet(CheckInResult.NotFound::new);
	}
}
