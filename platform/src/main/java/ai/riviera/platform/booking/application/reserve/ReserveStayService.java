package ai.riviera.platform.booking.application.reserve;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.function.Function;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.api.SetAvailabilityFacts;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.BookingCodeGenerator;
import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.request.RequestWindows;
import ai.riviera.platform.booking.application.reserve.CreateStayCommand.Stretch;
import ai.riviera.platform.booking.application.reserve.StayReserveOutcome.ReservedStretch;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The committed reserve phase of a stitched stay (design D6): every stretch's set judged by the
 * shared {@link ReserveFences} over the whole stay, then every {@code (set, date)} of every stretch
 * claimed all-or-nothing (invariant #2), the stay row inserted with the group's one code (invariant
 * #7) and one {@code AWAITING_PAYMENT} booking per stretch under it — in one transaction that
 * commits before any payment call. At a Request-to-Book venue: one pending stretch each, claiming nothing.
 */
@Service
class ReserveStayService {

	private static final int MAX_CODE_ATTEMPTS = 5;

	private final ai.riviera.platform.venue.api.SetBookingFacts setFacts;
	private final AvailabilityClaim availability;
	private final SetAvailabilityFacts taken;
	private final ReserveFences fences;
	private final CustomerDirectory customers;
	private final Bookings bookings;
	private final BookingCodeGenerator codeGenerator;
	private final BookingCutoff cutoff;
	private final RequestWindows requestWindows;
	private final Clock clock;

	ReserveStayService(ai.riviera.platform.venue.api.SetBookingFacts setFacts, AvailabilityClaim availability,
			SetAvailabilityFacts taken, ReserveFences fences, CustomerDirectory customers, Bookings bookings,
			BookingCodeGenerator codeGenerator, BookingCutoff cutoff, RequestWindows requestWindows, Clock clock) {
		this.setFacts = setFacts;
		this.availability = availability;
		this.taken = taken;
		this.fences = fences;
		this.customers = customers;
		this.bookings = bookings;
		this.codeGenerator = codeGenerator;
		this.cutoff = cutoff;
		this.requestWindows = requestWindows;
		this.clock = clock;
	}

	@Transactional
	StayReserveOutcome reserve(CreateStayCommand command) {
		List<SetId> setIds = command.stretches().stream().map(Stretch::setId).distinct().toList();
		Map<SetId, SetBookingInfo> sets = setFacts.setBookingInfosForReserve(setIds);
		if (sets.size() != setIds.size() || sets.values().stream().map(SetBookingInfo::venueId).distinct().count() != 1) {
			return new StayReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET);
		}
		Instant now = clock.instant();
		StaySpan stay = command.stay();
		for (Stretch stretch : command.stretches()) {
			Optional<BookingOutcome.Rejected> refused = fences.refuse(sets.get(stretch.setId()), stay, now);
			if (refused.isPresent()) {
				return new StayReserveOutcome.Rejected(refused.get());
			}
		}
		SetBookingInfo venue = sets.get(command.stretches().getFirst().setId());
		if (venue.bookingMode() == BookingMode.REQUEST) {
			return requestPending(command, sets, venue, now);
		}
		ClaimOutcome claim = claimEveryDay(command.stretches());
		switch (claim) {
			case ALREADY_TAKEN -> { return new StayReserveOutcome.Rejected(BookingOutcome.Rejected.SET_TAKEN); }
			case NOT_ONLINE_POOL -> { return new StayReserveOutcome.Rejected(BookingOutcome.Rejected.NOT_ONLINE_POOL); }
			case NO_SUCH_SET -> { return new StayReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET); }
			case CLAIMED -> { /* every day won — proceed */ }
		}
		CustomerId customerId = customers.findOrCreate(command.contact());
		InsertedStay inserted = insertStayWithUniqueCode(venue.venueId(), stay);
		List<ReservedStretch> stretches = insertStretches(command, sets, customerId, inserted,
				bookings::insertAwaitingPayment);
		return new StayReserveOutcome.Reserved(inserted.id(), inserted.code(), venue, customerId, stretches);
	}

	/**
	 * A stay request at a Request-to-Book venue holds nothing (ADR-0025, #1267): a day already taken on
	 * any stretch refuses it as a read, else one pending booking per stretch under one shared deadline,
	 * capped at the first day's sales close (invariant #4).
	 */
	private StayReserveOutcome requestPending(CreateStayCommand command, Map<SetId, SetBookingInfo> sets,
			SetBookingInfo venue, Instant now) {
		for (Stretch stretch : command.stretches()) {
			if (!taken.takenDaysBetween(List.of(stretch.setId()), stretch.firstDay(), stretch.lastDay()).isEmpty()) {
				return new StayReserveOutcome.Rejected(BookingOutcome.Rejected.SET_TAKEN);
			}
		}
		CustomerId customerId = customers.findOrCreate(command.contact());
		Instant closes = cutoff.salesCloseAt(venue.salesClose(), command.stay().firstDay());
		Instant window = now.plus(requestWindows.expiryWindow());
		Instant expiresAt = window.isBefore(closes) ? window : closes;
		InsertedStay inserted = insertStayWithUniqueCode(venue.venueId(), command.stay());
		List<ReservedStretch> stretches = insertStretches(command, sets, customerId, inserted,
				row -> bookings.insertPendingRequest(row, expiresAt));
		return new StayReserveOutcome.Requested(inserted.id(), inserted.code(), venue, stretches, expiresAt);
	}

	/** One booking per stretch under the stay, at its own total (#5), with a derived row code never shown (#7). */
	private List<ReservedStretch> insertStretches(CreateStayCommand command, Map<SetId, SetBookingInfo> sets,
			CustomerId customerId, InsertedStay inserted, Function<NewBooking, OptionalLong> insert) {
		List<ReservedStretch> stretches = new ArrayList<>();
		int n = 0;
		for (Stretch stretch : command.stretches()) {
			SetBookingInfo set = sets.get(stretch.setId());
			long amountMinor = Math.multiplyExact(set.price().minorUnits(), (long) stretch.span().days());
			String rowCode = inserted.code() + "-" + (++n);
			OptionalLong bookingId = insert.apply(new NewBooking(rowCode, set.venueId(), set.setId(), customerId,
					command.accountId(), stretch.firstDay(), stretch.lastDay(), amountMinor, set.price().currency(),
					inserted.id()));
			if (bookingId.isEmpty()) {
				throw new IllegalStateException("a stretch's row code collided with an existing booking code");
			}
			stretches.add(new ReservedStretch(bookingId.getAsLong(), set, stretch.firstDay(), stretch.lastDay(), amountMinor));
		}
		return stretches;
	}

	/**
	 * Claims one {@code (set, date)} row per day of every stretch (invariant #2), all or nothing: a day
	 * that loses gives back every day already won across every stretch, because a {@code Rejected}
	 * return commits and a claim left behind would be a row nothing can identify.
	 */
	private ClaimOutcome claimEveryDay(List<Stretch> stretches) {
		List<Won> won = new ArrayList<>();
		for (Stretch stretch : stretches) {
			for (LocalDate day : stretch.span().eachDay()) {
				ClaimOutcome outcome = availability.claim(stretch.setId(), day);
				if (outcome != ClaimOutcome.CLAIMED) {
					won.forEach(held -> availability.release(held.setId(), held.day()));
					return outcome;
				}
				won.add(new Won(stretch.setId(), day));
			}
		}
		return ClaimOutcome.CLAIMED;
	}

	private InsertedStay insertStayWithUniqueCode(VenueId venueId, StaySpan stay) {
		for (int attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
			String code = codeGenerator.next();
			OptionalLong id = bookings.insertStay(new NewStay(code, venueId, stay.firstDay(), stay.lastDay()));
			if (id.isPresent()) {
				return new InsertedStay(new StayId(id.getAsLong()), code);
			}
		}
		throw new IllegalStateException("could not generate a unique stay code after " + MAX_CODE_ATTEMPTS + " attempts");
	}

	private record Won(SetId setId, LocalDate day) {
	}

	private record InsertedStay(StayId id, String code) {
	}
}
