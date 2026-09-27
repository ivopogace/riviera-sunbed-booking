package ai.riviera.platform.booking.application.reserve;

import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.operator.api.VenueVisibility;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.StaySpan;

/**
 * The reserve fences, in the order both reserve paths judge them: a hidden venue's set books like
 * one that does not exist ({@code NO_SUCH_SET}), the online pool (invariant #3), the season closure
 * on every day and the sales close on the first (invariant #4), a Request-to-Book venue refusing
 * a range, the venue's maximum stay. Rationale: RESPONSIBILITIES.md §booking.
 */
@Component
class ReserveFences {

	private final VenueVisibility visibility;
	private final BookingCutoff cutoff;

	ReserveFences(VenueVisibility visibility, BookingCutoff cutoff) {
		this.visibility = visibility;
		this.cutoff = cutoff;
	}

	/** The refusal for booking {@code set} over {@code stay} at {@code now}, or empty when it may be claimed. */
	Optional<BookingOutcome.Rejected> refuse(SetBookingInfo set, StaySpan stay, Instant now) {
		if (!visibility.isVisible(new VenueRef(set.venueId().value()))) {
			return Optional.of(BookingOutcome.Rejected.NO_SUCH_SET);
		}
		if (set.pool() != Pool.ONLINE) {
			return Optional.of(BookingOutcome.Rejected.NOT_ONLINE_POOL);
		}
		if (!stay.eachDay().stream().allMatch(day -> cutoff.admitsDate(set.seasonClosure(), day, now))) {
			return Optional.of(BookingOutcome.Rejected.VENUE_CLOSED);
		}
		if (!cutoff.isBookable(set.salesClose(), stay.firstDay(), now)) {
			return Optional.of(BookingOutcome.Rejected.BOOKING_CLOSED);
		}
		if (set.bookingMode() == BookingMode.REQUEST && !stay.isOneDay()) {
			return Optional.of(BookingOutcome.Rejected.RANGE_NOT_OFFERED);
		}
		if (set.maxStayDays() != null && stay.days() > set.maxStayDays()) {
			return Optional.of(BookingOutcome.Rejected.STAY_TOO_LONG);
		}
		return Optional.empty();
	}
}
