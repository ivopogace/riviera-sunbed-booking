package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The closed-for-season use cases behind {@link CloseForSeason}. Each call's first act is
 * {@link VenueOwnership#assertOwns} (invariant #13), then existence, then the write; the close
 * stamps the closure with the injected UTC clock and answers what guests are still owed from today
 * in {@code Europe/Tirane} (invariant #6) through {@link BookingPresence}. Package-private — the
 * port is the seam.
 */
@Service
class SeasonClosureService implements CloseForSeason {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Venues venues;
	private final VenueOwnership ownership;
	private final BookingPresence bookings;
	private final Clock clock;

	SeasonClosureService(Venues venues, VenueOwnership ownership, BookingPresence bookings, Clock clock) {
		this.venues = venues;
		this.ownership = ownership;
		this.bookings = bookings;
		this.clock = clock;
	}

	@Override
	@Transactional
	public CloseOutcome close(OperatorId operator, VenueId venueId, SeasonClosure closure) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!closure.closed()) {
			throw new IllegalArgumentException("close needs a closed value; reopen clears the state");
		}
		if (!venues.venueExists(venueId)) {
			return new CloseOutcome.Rejected(SeasonClosureRejection.NO_SUCH_VENUE);
		}
		// One reading: the stamp, the today the reopen day is checked against, and the counts' floor.
		Instant now = clock.instant();
		LocalDate today = LocalDate.ofInstant(now, TIRANE);
		if (closure.reopenOn() != null && !closure.reopenOn().isAfter(today)) {
			return new CloseOutcome.Rejected(SeasonClosureRejection.REOPEN_DATE_PASSED);
		}
		venues.closeForSeason(venueId, closure, now);
		return new CloseOutcome.Closed(closure, bookings.liveBookingsFrom(venueId, today));
	}

	@Override
	@Transactional
	public ReopenOutcome reopen(OperatorId operator, VenueId venueId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		if (!venues.venueExists(venueId)) {
			return ReopenOutcome.NO_SUCH_VENUE;
		}
		venues.reopenForSeason(venueId);
		return ReopenOutcome.REOPENED;
	}
}
