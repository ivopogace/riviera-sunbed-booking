package ai.riviera.platform.booking.application.reserve;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.request.RequestWindows;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.function.Function;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.BookingCodeGenerator;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.operator.api.VenueVisibility;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.api.SetBookingFacts;

/**
 * The committed <em>reserve</em> phase: validate the set (online pool, invariant #3; season closure,
 * then the first day's sales close, invariant #4; maximum stay), claim every {@code (set, date)}
 * (invariant #2), resolve the guest and insert the booking, in <strong>one transaction that commits
 * before any payment call</strong>, so no row lock spans the Stripe round-trip. The claims join it
 * ({@code REQUIRED}): a failure before the insert rolls them back. Only {@code CreateBookingService}
 * calls it; not a published seam. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Service
class ReserveSetService {

	private static final int MAX_CODE_ATTEMPTS = 5;

	private final SetBookingFacts setFacts;
	private final AvailabilityClaim availability;
	private final VenueVisibility visibility;
	private final CustomerDirectory customers;
	private final Bookings bookings;
	private final BookingCodeGenerator codeGenerator;
	private final BookingCutoff cutoff;
	private final RequestWindows requestWindows;
	private final Clock clock;

	ReserveSetService(SetBookingFacts setFacts, AvailabilityClaim availability,
			VenueVisibility visibility, CustomerDirectory customers, Bookings bookings,
			BookingCodeGenerator codeGenerator, BookingCutoff cutoff, RequestWindows requestWindows,
			Clock clock) {
		this.setFacts = setFacts;
		this.availability = availability;
		this.visibility = visibility;
		this.customers = customers;
		this.bookings = bookings;
		this.codeGenerator = codeGenerator;
		this.cutoff = cutoff;
		this.requestWindows = requestWindows;
		this.clock = clock;
	}

	/**
	 * Validate, claim, and persist the {@code AWAITING_PAYMENT} booking in one committed transaction.
	 * On return the {@code (set, date)} is held and the row lock released — the caller pays outside
	 * any transaction.
	 */
	@Transactional
	ReserveOutcome reserve(CreateBookingCommand command) {
		Optional<SetBookingInfo> found = setFacts.setBookingInfo(command.setId());
		if (found.isEmpty()) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET);
		}
		SetBookingInfo set = found.get();
		// A hidden venue's set books like one that does not exist, refused before any claim.
		if (!visibility.isVisible(new VenueRef(set.venueId().value()))) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET);
		}
		if (set.pool() != Pool.ONLINE) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NOT_ONLINE_POOL);
		}
		// One reading of the clock, so both fences and the request deadline classify the same instant.
		Instant now = clock.instant();
		StaySpan stay = command.stay();
		if (!stay.eachDay().stream().allMatch(day -> cutoff.admitsDate(set.seasonClosure(), day, now))) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.VENUE_CLOSED);
		}
		if (!cutoff.isBookable(set.salesClose(), stay.firstDay(), now)) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.BOOKING_CLOSED);
		}
		if (set.bookingMode() == BookingMode.REQUEST && !stay.isOneDay()) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.RANGE_NOT_OFFERED);
		}
		if (set.maxStayDays() != null && stay.days() > set.maxStayDays()) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.STAY_TOO_LONG);
		}

		ClaimOutcome claim = claimEveryDay(command.setId(), stay);
		switch (claim) {
			case ALREADY_TAKEN -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.SET_TAKEN); }
			case NOT_ONLINE_POOL -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NOT_ONLINE_POOL); }
			case NO_SUCH_SET -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET); }
			case CLAIMED -> { /* won the claim — proceed */ }
		}

		long amountMinor = Math.multiplyExact(set.price().minorUnits(), (long) stay.days());
		CustomerId customerId = customers.findOrCreate(command.contact());
		// Request-to-Book (issue #98): a REQUEST venue's booking starts as a pending request that
		// holds the claimed (set, date) row but triggers no payment — payment-request-on-accept.
		// The accept deadline caps at D's sales close: past it the venue has shut its own window.
		if (set.bookingMode() == BookingMode.REQUEST) {
			Instant expiresAt = min(now.plus(requestWindows.expiryWindow()),
					cutoff.salesCloseAt(set.salesClose(), command.bookingDate()));
			Inserted pending = insertWithUniqueCode(set, customerId, command, amountMinor,
					b -> bookings.insertPendingRequest(b, expiresAt));
			return new ReserveOutcome.RequestPending(pending.id(), pending.code(), set, expiresAt, amountMinor);
		}
		Inserted inserted = insertWithUniqueCode(set, customerId, command, amountMinor,
				bookings::insertAwaitingPayment);
		return new ReserveOutcome.Reserved(inserted.id(), inserted.code(), set, customerId, amountMinor);
	}

	/**
	 * Claims one {@code (set, date)} row per day of the stay (invariant #2), all or nothing: a day
	 * that loses gives back every day already won, because a {@code Rejected} return commits and a
	 * claim left behind would be a row nothing can identify.
	 */
	private ClaimOutcome claimEveryDay(SetId setId, StaySpan stay) {
		List<LocalDate> won = new ArrayList<>();
		for (LocalDate day : stay.eachDay()) {
			ClaimOutcome outcome = availability.claim(setId, day);
			if (outcome != ClaimOutcome.CLAIMED) {
				won.forEach(held -> availability.release(setId, held));
				return outcome;
			}
			won.add(day);
		}
		return ClaimOutcome.CLAIMED;
	}

	private static Instant min(Instant a, Instant b) {
		return a.isBefore(b) ? a : b;
	}

	/**
	 * Inserts the booking, regenerating the code on a {@code UNIQUE(code)} collision (invariant #7)
	 * with bounded retries. The insert is {@code ON CONFLICT (code) DO NOTHING}: a collision must
	 * return empty, never throw, or it poisons the transaction.
	 */
	private Inserted insertWithUniqueCode(SetBookingInfo set, CustomerId customerId,
			CreateBookingCommand command, long amountMinor, Function<NewBooking, OptionalLong> insert) {
		for (int attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
			String code = codeGenerator.next();
			OptionalLong id = insert.apply(new NewBooking(code, set.venueId(),
					set.setId(), customerId, command.accountId(), command.bookingDate(), command.lastDate(),
					amountMinor, set.price().currency()));
			if (id.isPresent()) {
				return new Inserted(id.getAsLong(), code);
			}
		}
		throw new IllegalStateException(
				"could not generate a unique booking code after " + MAX_CODE_ATTEMPTS + " attempts");
	}

	private record Inserted(long id, String code) {
	}
}
