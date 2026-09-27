package ai.riviera.platform.booking.application.reserve;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.request.RequestWindows;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.function.Function;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.api.SetAvailabilityFacts;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.BookingCodeGenerator;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.api.SetBookingFacts;

/**
 * The committed <em>reserve</em> phase: validate the set (online pool, invariant #3; season closure,
 * then the first day's sales close, invariant #4; maximum stay), claim every {@code (set, date)}
 * (invariant #2), resolve the guest and insert the booking, in <strong>one transaction that commits
 * before any payment call</strong>, so no row lock spans the Stripe round-trip. A Request-to-Book
 * venue's request claims nothing: a taken day refuses it, the accept claims (ADR-0025). Only
 * {@code CreateBookingService} calls it; not a published seam. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Service
class ReserveSetService {

	private static final int MAX_CODE_ATTEMPTS = 5;

	private final SetBookingFacts setFacts;
	private final AvailabilityClaim availability;
	private final SetAvailabilityFacts taken;
	private final ReserveFences fences;
	private final CustomerDirectory customers;
	private final Bookings bookings;
	private final BookingCodeGenerator codeGenerator;
	private final BookingCutoff cutoff;
	private final RequestWindows requestWindows;
	private final Clock clock;

	ReserveSetService(SetBookingFacts setFacts, AvailabilityClaim availability, SetAvailabilityFacts taken,
			ReserveFences fences, CustomerDirectory customers, Bookings bookings,
			BookingCodeGenerator codeGenerator, BookingCutoff cutoff, RequestWindows requestWindows,
			Clock clock) {
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
		// One reading of the clock, so both fences and the request deadline classify the same instant.
		Instant now = clock.instant();
		StaySpan stay = command.stay();
		Optional<BookingOutcome.Rejected> refused = fences.refuse(set, stay, now);
		if (refused.isPresent()) {
			return new ReserveOutcome.Rejected(refused.get());
		}

		long amountMinor = Math.multiplyExact(set.price().minorUnits(), (long) stay.days());
		if (set.bookingMode() == BookingMode.REQUEST) {
			return requestPending(set, command, stay, amountMinor, now);
		}
		ClaimOutcome claim = SpanClaim.claimEveryDay(availability, command.setId(), stay);
		switch (claim) {
			case ALREADY_TAKEN -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.SET_TAKEN); }
			case NOT_ONLINE_POOL -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NOT_ONLINE_POOL); }
			case NO_SUCH_SET -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET); }
			case CLAIMED -> { /* won the claim — proceed */ }
		}
		CustomerId customerId = customers.findOrCreate(command.contact());
		Inserted inserted = insertWithUniqueCode(set, customerId, command, amountMinor,
				bookings::insertAwaitingPayment);
		return new ReserveOutcome.Reserved(inserted.id(), inserted.code(), set, customerId, amountMinor);
	}

	/**
	 * A Request-to-Book request holds nothing (ADR-0025): a day already taken refuses it as a read, else
	 * the pending row is inserted uncharged; the accept deadline caps at D's sales close (invariant #4).
	 */
	private ReserveOutcome requestPending(SetBookingInfo set, CreateBookingCommand command, StaySpan stay,
			long amountMinor, Instant now) {
		if (!taken.takenDaysBetween(List.of(set.setId()), stay.firstDay(), stay.lastDay()).isEmpty()) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.SET_TAKEN);
		}
		CustomerId customerId = customers.findOrCreate(command.contact());
		Instant expiresAt = min(now.plus(requestWindows.expiryWindow()),
				cutoff.salesCloseAt(set.salesClose(), command.bookingDate()));
		Inserted pending = insertWithUniqueCode(set, customerId, command, amountMinor,
				b -> bookings.insertPendingRequest(b, expiresAt));
		return new ReserveOutcome.RequestPending(pending.id(), pending.code(), set, expiresAt, amountMinor);
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
